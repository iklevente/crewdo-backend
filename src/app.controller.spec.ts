import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  it('delegates to AppService for the greeting', () => {
    jest.spyOn(service, 'getHello').mockReturnValue('tracked');

    expect(controller.getHello()).toBe('tracked');
    expect(service.getHello).toHaveBeenCalledTimes(1);
  });
});
