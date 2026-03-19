import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  @Process()
  async handleNotification(job: Job) {
    this.logger.log(`Processing notification job ${job.id}`);
    // TODO: Implement notification logic
  }
}
