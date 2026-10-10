export type DemoCredential = { login: string; password: string };
export type DemoWorkerCredential = { login: string; location: string } & (
  | { authenticationMethod: 'PIN'; pin: string; password?: never }
  | { authenticationMethod?: 'PASSWORD'; password: string; pin?: never }
);
export type DemoCompany = {
  slug: string;
  name: string;
  admin: DemoCredential;
  users: DemoWorkerCredential[];
};
export type DemoAccounts = { warning: string; platform: DemoCredential; companies: DemoCompany[] };
