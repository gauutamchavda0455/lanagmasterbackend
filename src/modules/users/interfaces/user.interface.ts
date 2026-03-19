import { Role } from '../../../common/enums/role.enum';
import { Status } from '../../../common/enums/status.enum';

export interface IUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
}
