import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
};
export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  children?: ReactNode;
};
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string };
export type BadgeProps = {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
};
export type NoticeProps = { children: ReactNode; tone?: 'error' | 'success' | 'info' };
export type EmptyProps = { title: string; description: string; children?: ReactNode };
export type LoadingProps = { label?: string };
export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};
export type PageTitleProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};
export type BreadcrumbProps = { children: ReactNode };

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
