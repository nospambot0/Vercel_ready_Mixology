import { handleLogin } from './_auth';

export default function handler(req: any, res: any): void {
  handleLogin(req, res);
}