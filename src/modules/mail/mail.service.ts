import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendWelcome(user: { email: string; name: string }) {
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Welcome!',
      template: 'welcome',
      context: { name: user.name },
    });
  }

  async sendResetPassword(
    user: { email: string; name: string },
    token: string,
  ) {
    const url = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Reset Password',
      template: 'reset-password',
      context: { name: user.name, url },
    });
  }

  async sendVerifyEmail(user: { email: string; name: string }, token: string) {
    const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Verify Email',
      template: 'verify-email',
      context: { name: user.name, url },
    });
  }

  async sendOtp(user: { email: string; name: string }, otp: string) {
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Your OTP Code',
      template: 'otp',
      context: { name: user.name, otp },
    });
  }
}
