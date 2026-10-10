import { formText } from '../../../shared/lib';

export function productInformationForm(form: FormData) {
  const nutrient = (name: string) => formText(form, name).replace(',', '.') || null;
  const declaredList = (name: string) =>
    form.get(`${name}Declared`) === 'on'
      ? formText(form, name)
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      : null;
  return {
    calories: nutrient('calories'),
    protein: nutrient('protein'),
    fat: nutrient('fat'),
    carbs: nutrient('carbs'),
    nutritionBasis: formText(form, 'nutritionBasis') || 'PER_PORTION',
    allergens: declaredList('allergens'),
    ingredients: declaredList('ingredients'),
  };
}
