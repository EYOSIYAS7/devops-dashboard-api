import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
  });

  // Global validation pipe — automatically validates all
  // incoming request bodies, params, and queries using
  // class-validator decorators. Strips unknown properties.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if unknown props sent
      transform: true, // Auto-transform payloads to DTO instances
    }),
  );

  // Swagger setup — generates interactive API docs automatically
  // from our controller decorators
  const config = new DocumentBuilder()
    .setTitle('DevOps Dashboard API')
    .setDescription(
      'A REST API for monitoring and managing Kubernetes cluster resources. ' +
        'Provides real-time pod health, node metrics, deployment status, and alerting.',
    )
    .setVersion('1.0')
    .addTag('Cluster', 'High-level cluster overview and health')
    .addTag('Pods', 'Pod listing, filtering, and health status')
    .addTag('Nodes', 'Node details and resource usage')
    .addTag('Deployments', 'Deployment health and replica status')
    .addTag('Namespaces', 'Namespace listing and filtering')
    .addTag('Metrics', 'Historical CPU, memory, and pod count metrics')
    .addTag('Alerts', 'Cluster alerts and notifications')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Swagger UI available at /api
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application running on: http://localhost:${port}`);
  console.log(`Swagger docs available at: http://localhost:${port}/api`);
}

bootstrap();
