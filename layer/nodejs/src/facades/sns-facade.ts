import {
  SNSClient,
  PublishCommand,
  PublishCommandOutput,
  MessageAttributeValue,
} from '@aws-sdk/client-sns';
import { SERVICE_TYPE, createClient } from '../factories/aws-client.factory';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

export class SNSFacade {
  client: SNSClient;
  private logService = new LogService('SNSFacade');

  /**
   *
   */
  constructor(private idExecucao: string) {
    this.client = createClient(SERVICE_TYPE.SNS) as SNSClient;
    this.logService.info('✅ Cliente SNS configurado e inicializado');
  }

  async sendMessage(
    topicArn: string,
    messageBody: string,
    messageAttributes?: Record<string, MessageAttributeValue>
  ): Promise<PublishCommandOutput> {
    this.logService.info(
      `Enviando mensagem para o tópico ${topicArn}`,
      { idExecucao: this.idExecucao },
      { messageBody }
    );
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: messageBody,
      MessageAttributes: messageAttributes,
    });
    return this.client.send(command);
  }
}
