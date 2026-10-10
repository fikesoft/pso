function units(value, scale) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}

export function cartTotal(lines) {
  const cents = lines.reduce((sum, line) => {
    const base = units(line.product.price ?? line.product.unitTotal, 4);
    const extras = line.modifiers.reduce(
      (groupSum, selection) =>
        groupSum + selection.prices.reduce((optionSum, price) => optionSum + units(price, 4), 0n),
      0n,
    );
    return sum + (base + extras + 50n) / 100n;
  }, 0n);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function orderLine(line) {
  return {
    externalProductId: line.product.externalProductId,
    quantity: '1.000',
    modifiers: line.modifiers.map(({ bindingId, bindingVersion, groupVersion, optionIds }) => ({
      bindingId,
      bindingVersion,
      groupVersion,
      optionIds: [...optionIds].sort(),
    })),
  };
}

export function modifierControls(product) {
  const groups = [];
  const container = document.createElement('div');
  for (const binding of product.modifierGroups ?? []) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${binding.group.name} — alege ${binding.group.minSelections}–${binding.group.maxSelections}`;
    fieldset.append(legend);
    const inputs = [];
    const radioName = `modifier-${product.externalProductId}-${binding.id}`;
    if (binding.group.maxSelections === 1 && binding.group.minSelections === 0) {
      const none = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = radioName;
      radio.checked = true;
      none.append(radio, ' Fără opțiune');
      fieldset.append(none);
    }
    for (const option of binding.group.options) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = binding.group.maxSelections === 1 ? 'radio' : 'checkbox';
      if (input.type === 'radio') input.name = radioName;
      input.value = option.id;
      label.append(input, ` ${option.name} (+${option.extraPrice} MDL)`);
      fieldset.append(label);
      inputs.push({ input, option });
    }
    groups.push({ binding, inputs });
    container.append(fieldset);
  }
  function selected() {
    const modifiers = [];
    for (const { binding, inputs } of groups) {
      const choices = inputs.filter(({ input }) => input.checked).map(({ option }) => option);
      if (
        choices.length < binding.group.minSelections ||
        choices.length > binding.group.maxSelections
      )
        return null;
      modifiers.push({
        bindingId: binding.id,
        bindingVersion: binding.version,
        groupVersion: binding.group.version,
        optionIds: choices.map((option) => option.id).sort(),
        prices: choices.map((option) => option.extraPrice),
        names: choices.map((option) => option.name),
      });
    }
    return modifiers.sort((a, b) => a.bindingId.localeCompare(b.bindingId));
  }
  return { container, selected };
}
