import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommandOutput,
  MessageAttributeValue,
  ReceiveMessageCommandOutput,
  DeleteMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { SERVICE_TYPE, createClient } from '../factories/aws-client.factory';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

export class SQSFacade {
  client: SQSClient;
  private logService = new LogService('SQSFacade');

  /**
   *
   */
  constructor() {
    this.client = createClient(SERVICE_TYPE.SQS) as SQSClient;
    this.logService.info('✅ Cliente SQS configurado e inicializado');
  }

  async sendMessage(
    queueUrl: string,
    messageBody: string,
    messageAttributes?: Record<string, MessageAttributeValue>
  ): Promise<SendMessageCommandOutput> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
      MessageAttributes: messageAttributes,
    });
    return this.client.send(command);
  }

  async receiveMessage(queueUrl: string): Promise<ReceiveMessageCommandOutput> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      MessageAttributeNames: ['All'],
    });
    return this.client.send(command);
  }

  async deleteMessage(
    queueUrl: string,
    receiptHandle: string
  ): Promise<DeleteMessageCommandOutput> {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
    return this.client.send(command);
  }
}
