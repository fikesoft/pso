import { formText } from '../../../shared/lib';
import type { EmployeeFieldsRequest } from '../model/staff-request.types';

export function employeeFields(form: FormData): EmployeeFieldsRequest {
  return {
    firstName: formText(form, 'firstName').trim() || null,
    lastName: formText(form, 'lastName').trim() || null,
    phone: formText(form, 'phone').trim() || null,
    email: formText(form, 'email').trim() || null,
    employeeCode: formText(form, 'employeeCode').trim() || null,
    hireDate: formText(form, 'hireDate') || null,
  };
}
