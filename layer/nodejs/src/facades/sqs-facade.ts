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
  constructor(private idExecucao: string) {
    this.client = createClient(SERVICE_TYPE.SQS) as SQSClient;
    this.logService.info('✅ Cliente SQS configurado e inicializado');
  }

  async sendMessage(
    queueUrl: string,
    messageBody: string,
    messageAttributes?: Record<string, MessageAttributeValue>
  ): Promise<SendMessageCommandOutput> {
    this.logService.info(
      `Enviando mensagem para a fila ${queueUrl}`,
      { idExecucao: this.idExecucao },
      { messageBody }
    );
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
      MessageAttributes: messageAttributes,
    });
    return this.client.send(command);
  }

  async receiveMessage(queueUrl: string): Promise<ReceiveMessageCommandOutput> {
    this.logService.info(`Recebendo mensagens da fila ${queueUrl}`, {
      idExecucao: this.idExecucao,
    });
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
    this.logService.info(`Deletando mensagem da fila ${queueUrl}`, { idExecucao: this.idExecucao });
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
    return this.client.send(command);
  }
}
