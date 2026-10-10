import { Field } from '@pos/ui';
import { employeeMessages as text } from '@pos/ui/locales';
import type { StaffFormProps } from '../model/staff-form.types';

export function EmployeeFields({ user }: Pick<StaffFormProps, 'user'>) {
  return (
    <fieldset className="form-stack">
      <legend>{text.personalData}</legend>
      <div className="form-grid">
        <Field
          label={text.firstName}
          name="firstName"
          defaultValue={user?.firstName ?? ''}
          maxLength={100}
          autoComplete="off"
        />
        <Field
          label={text.lastName}
          name="lastName"
          defaultValue={user?.lastName ?? ''}
          maxLength={100}
          autoComplete="off"
        />
      </div>
      <Field
        label={text.phone}
        name="phone"
        type="tel"
        defaultValue={user?.phone ?? ''}
        maxLength={40}
        autoComplete="off"
      />
      <Field
        label={text.email}
        name="email"
        type="email"
        defaultValue={user?.email ?? ''}
        maxLength={254}
        autoComplete="off"
      />
      <div className="form-grid">
        <Field
          label={text.employeeCode}
          name="employeeCode"
          defaultValue={user?.employeeCode ?? ''}
          maxLength={40}
        />
        <Field
          label={text.hireDate}
          name="hireDate"
          type="date"
          defaultValue={user?.hireDate?.slice(0, 10) ?? ''}
        />
      </div>
      <p className="muted text-small">{text.optionalHint}</p>
    </fieldset>
  );
}
