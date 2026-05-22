![GitHub](https://img.shields.io/github/license/gustavoadolfo/minhoteca-adapter-layer)
![npm](https://img.shields.io/npm/v/@gustavoadolfo/minhoteca-adapter-layer)
![CI](https://github.com/gustavoadolfo/minhoteca-adapter-layer/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-61%20passed-success)

# Minhoteca Adapter Layer

**Camada principal de entidades e modelos de dados do projeto Minhoteca.**

Este projeto oferece classes, objetos de valor e DTOs reutilizáveis para acelerar o desenvolvimento das funções Lambda e microsserviços do ecossistema Minhoteca.

## 🎯 Propósito Social

Minhoteca tem como missão facilitar o acesso gratuito à leitura, gestão de empréstimos e organização de pequenas bibliotecas em comunidades, ONGs e projetos sociais, contribuindo para os Objetivos de Desenvolvimento Sustentável (ODS) da ONU — especialmente os que tratam de educação de qualidade e redução das desigualdades.

**Alinhamento aos ODS:**

- 🎓 ODS 4: Educação de Qualidade
- 📚 ODS 10: Redução das Desigualdades
- 💚 ODS 17: Parcerias para a Implementação dos Objetivos

## ✨ Funcionalidades

- **Integrações Nativas:** Repositórios robustos e padronizados para `MongoDB`, `DynamoDB` e `AWS S3`.
- **Tratamento de Erros e Logs:** Ampla utilização do `LogService` em todas as classes, proporcionando logs traduzidos, padronizados (emojis) e excelente observabilidade.
- **Infraestrutura como Código:** Módulo Terraform incluso para provisionamento simplificado de Lambda Layers na AWS.
- **Testes Completos:** Alta cobertura de testes unitários integrados ao CI.
- **CI/CD Automatizado:** Validações rigorosas de linting, testes e automação de deploy via GitHub Actions.
- **Compatibilidade Moderna:** Suporte garantido ao `Node.js 24.x`.

## 🚀 Começar Rápido

### Instalação

```bash
npm install @gustavoadolfo/minhoteca-adapter-layer
```

### Uso Básico

```typescript
import {
  DynamoDBRepository,
  MongoDBRepository,
  S3Repository,
} from '@gustavoadolfo/minhoteca-adapter-layer';

// Instanciar um repositório (com logs e tratamentos de erro nativos)
const dynamoRepo = new DynamoDBRepository();

// Buscar um item por ID na AWS
const item = await dynamoRepo.findByMinhotecaId('MinhasTabelas', '12345');
console.log(item.data);
```

## 📚 Documentação

- **[Arquitetura e Conceitos](./docs/ARCHITECTURE.md)** - Domain-Driven Design, Entities, Value Objects
- **[Exemplos Práticos](./docs/EXAMPLES.md)** - Código real para diferentes cenários
- **[Deploy em Lambda Layer](./docs/LAMBDA_LAYER_DEPLOYMENT.md)** - Guia passo-a-passo para AWS

## 🏗️ Estrutura

```
src/
├── entities/       # Livro, Autor, Editora
├── value-objects/  # ISBN, Email, Nome, Data
├── dtos/          # Data Transfer Objects
├── adapters/      # Conversão Entity ↔ DTO
├── errors/        # Erros de domínio
└── __tests__/     # Testes (61 casos)
```

## 🧪 Testes

```bash
npm test              # Rodar testes unitários
npm test:coverage    # Ver cobertura
npm test:watch      # Modo watch
npm run test:integration # Rodar testes de integração (requer configuração local/AWS)
```

## 🔨 Desenvolvimento

```bash
npm run build       # Compilar TypeScript
npm run lint        # ESLint
npm run lint:fix    # Auto-corrigir
npm run clean       # Limpar dist/
```

## 📦 Como Lambda Layer

A layer é automaticamente publicada quando você cria uma tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Veja [Deploy em Lambda Layer](./docs/LAMBDA_LAYER_DEPLOYMENT.md) para instruções detalhadas.

## 🤝 Contribuir

Queremos sua contribuição! Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para:

- Padrões de código
- Como escrever testes
- Processo de PR
- Convenção de commits

Contribuições em qualquer nível são bem-vindas:

- 🐛 Reportar bugs
- 📝 Melhorar documentação
- ✨ Sugerir features
- 🔧 Submeter PRs

## 📋 Roadmap

**v0.2.0** (Próximo):

- [ ] Entidade Empréstimo
- [ ] Repository interfaces
- [ ] DynamoDB examples
- [ ] AWS SDK helpers

**v0.3.0**:

- [ ] Rate limiting utilities
- [ ] Logging helpers
- [ ] Webhook support

## 📄 Licença

Distribuído sob licença **MIT** (veja [LICENSE](./LICENSE)).

Escolhemos MIT para incentivar:

- ✅ Uso comercial
- ✅ Modificações
- ✅ Distribuição
- ✅ Uso privado

**Único requisito**: Incluir aviso de copyright e licença.

## 🔗 Links

- [GitHub](https://github.com/GustavoAdolfo/minhoteca-adapter-layer)
- [npm](https://www.npmjs.com/package/@GustavoAdolfo/minhoteca-adapter-layer)
- [Issues](https://github.com/GustavoAdolfo/minhoteca-adapter-layer/issues)

## 💬 Suporte

- 📖 Leia a [documentação](./docs)
- 🐛 Abra uma [Issue](https://github.com/GustavoAdolfo/minhoteca-adapter-layer/issues)
- 💡 Veja os [exemplos](./docs/EXAMPLES.md)

---

**Minhoteca é código aberto e feito com ❤️ para a comunidade.**

Junte-se a nós na missão de democratizar o acesso à leitura! 📚
