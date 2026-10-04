import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { PublishCommand } from '@aws-sdk/client-sns';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';
import { SNSFacade } from '../../../layer/nodejs/src/facades/sns-facade';
import { SQSFacade } from '../../../layer/nodejs/src/facades/sqs-facade';
import { createClient, SERVICE_TYPE } from '../../../layer/nodejs/src/factories/aws-client.factory';

jest.mock('../../../layer/nodejs/src/factories/aws-client.factory', () => ({
  SERVICE_TYPE: {
    SNS: 'SNS',
    SQS: 'SQS',
  },
  createClient: jest.fn(),
}));

jest.mock('@gustavoadolfo/minhoteca-core-layer', () => ({
  LogService: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
  })),
}));

describe('SNSFacade', () => {
  let facade: SNSFacade;
  let mockSend: jest.Mock;
  let mockClient: { send: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    mockClient = { send: mockSend };
    (createClient as jest.Mock).mockReturnValue(mockClient);
    facade = new SNSFacade('execucao-sns');
  });

  it('initializes the SNS client and logs its configuration', () => {
    expect(createClient).toHaveBeenCalledWith(SERVICE_TYPE.SNS);
    expect(facade.client).toBe(mockClient);
    expect(LogService).toHaveBeenCalledWith('SNSFacade');
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith(
      '✅ Cliente SNS configurado e inicializado'
    );
  });

  it('publishes a message with its topic, body, and attributes', async () => {
    const messageAttributes = {
      source: { DataType: 'String', StringValue: 'test' },
    };
    const output = { MessageId: 'message-sns' };
    mockSend.mockResolvedValue(output);

    await expect(
      facade.sendMessage('arn:aws:sns:region:account:topic', 'conteudo', messageAttributes)
    ).resolves.toBe(output);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(PublishCommand);
    expect(command.input).toEqual({
      TopicArn: 'arn:aws:sns:region:account:topic',
      Message: 'conteudo',
      MessageAttributes: messageAttributes,
    });
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith(
      'Enviando mensagem para o tópico arn:aws:sns:region:account:topic',
      { idExecucao: 'execucao-sns' },
      { messageBody: 'conteudo' }
    );
  });

  it('propagates errors from the SNS client', async () => {
    const error = new Error('SNS indisponível');
    mockSend.mockRejectedValue(error);

    await expect(facade.sendMessage('topic', 'conteudo')).rejects.toBe(error);
  });
});

describe('SQSFacade', () => {
  let facade: SQSFacade;
  let mockSend: jest.Mock;
  let mockClient: { send: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    mockClient = { send: mockSend };
    (createClient as jest.Mock).mockReturnValue(mockClient);
    facade = new SQSFacade('execucao-sqs');
  });

  it('initializes the SQS client and logs its configuration', () => {
    expect(createClient).toHaveBeenCalledWith(SERVICE_TYPE.SQS);
    expect(facade.client).toBe(mockClient);
    expect(LogService).toHaveBeenCalledWith('SQSFacade');
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith(
      '✅ Cliente SQS configurado e inicializado'
    );
  });

  it('sends a message with its queue, body, and attributes', async () => {
    const messageAttributes = {
      source: { DataType: 'String', StringValue: 'test' },
    };
    const output = { MessageId: 'message-sqs' };
    mockSend.mockResolvedValue(output);

    await expect(
      facade.sendMessage(
        'https://sqs.region.amazonaws.com/account/queue',
        'conteudo',
        messageAttributes
      )
    ).resolves.toBe(output);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input).toEqual({
      QueueUrl: 'https://sqs.region.amazonaws.com/account/queue',
      MessageBody: 'conteudo',
      MessageAttributes: messageAttributes,
    });
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith(
      'Enviando mensagem para a fila https://sqs.region.amazonaws.com/account/queue',
      { idExecucao: 'execucao-sqs' },
      { messageBody: 'conteudo' }
    );
  });

  it('receives messages with the expected queue and receive options', async () => {
    const output = { Messages: [{ MessageId: 'message-sqs' }] };
    mockSend.mockResolvedValue(output);

    await expect(
      facade.receiveMessage('https://sqs.region.amazonaws.com/account/queue')
    ).resolves.toBe(output);

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(ReceiveMessageCommand);
    expect(command.input).toEqual({
      QueueUrl: 'https://sqs.region.amazonaws.com/account/queue',
      MaxNumberOfMessages: 10,
      MessageAttributeNames: ['All'],
    });
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith(
      'Recebendo mensagens da fila https://sqs.region.amazonaws.com/account/queue',
      { idExecucao: 'execucao-sqs' }
    );
  });

  it('deletes a message by its receipt handle', async () => {
    const output = {};
    mockSend.mockResolvedValue(output);

    await expect(
      facade.deleteMessage('https://sqs.region.amazonaws.com/account/queue', 'receipt-handle')
    ).resolves.toBe(output);

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteMessageCommand);
    expect(command.input).toEqual({
      QueueUrl: 'https://sqs.region.amazonaws.com/account/queue',
      ReceiptHandle: 'receipt-handle',
    });
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith(
      'Deletando mensagem da fila https://sqs.region.amazonaws.com/account/queue',
      { idExecucao: 'execucao-sqs' }
    );
  });

  it('propagates errors from the SQS client', async () => {
    const error = new Error('SQS indisponível');
    mockSend.mockRejectedValue(error);

    await expect(facade.receiveMessage('queue')).rejects.toBe(error);
  });
});
