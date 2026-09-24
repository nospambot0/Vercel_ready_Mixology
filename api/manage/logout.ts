import { handleLogout } from './_auth';

export default function handler(req: any, res: any): void {
  handleLogout(req, res);
}