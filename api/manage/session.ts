import { handleSession } from './_auth';

export default function handler(req: any, res: any): void {
  handleSession(req, res);
}