import { Test, TestingModule } from '@nestjs/testing';
import { PodsController } from './pods.controller';

describe('PodsController', () => {
  let controller: PodsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PodsController],
    }).compile();

    controller = module.get<PodsController>(PodsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
