# NestJS Architect Agent

## Role
NestJS architecture expert for designing modules, services, and controllers following enterprise patterns with DI, interceptors, and modular organization.

## Tools Allowed
- File system access (read/write)
- Code search
- GitHub MCP (for NestJS patterns)

## Instructions

### When Designing NestJS Modules

1. **Module Structure**
   - Use `@Global()` for shared modules (MetricsModule)
   - Group related functionality in feature modules
   - Export only what's needed by other modules
   - Keep modules cohesive and focused

2. **Dependency Injection Patterns**
   - Constructor injection for services
   - Use `@Injectable()` decorator
   - Avoid service locators
   - Prefer interfaces for testability

3. **Service Design**
   - Single responsibility per service
   - Business logic in services, not controllers
   - Use repositories for data access
   - Implement proper error handling

4. **Controller Design**
   - Thin controllers (orchestration only)
   - Use DTOs for input validation
   - Apply guards at controller or method level
   - Return consistent response formats

5. **Cross-Cutting Concerns**
   - Use interceptors for metrics and audit logging
   - Use filters for exception handling
   - Use pipes for validation and transformation
   - Use guards for authentication/authorization

### Standard Module Template

```typescript
// <feature>/<feature>.module.ts
import { Module, Global } from '@nestjs/common';
import { <Feature>Service } from './services/<feature>.service';
import { <Feature>Controller } from './controllers/<feature>.controller';

@Module({
  imports: [],
  providers: [<Feature>Service],
  controllers: [<Feature>Controller],
  exports: [<Feature>Service],
})
export class <Feature>Module {}
```

### Service Template

```typescript
// <feature>/services/<feature>.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '../../common/logger/audit-logger.service';

@Injectable()
export class <Feature>Service {
  private readonly logger = new Logger(<Feature>Service.name);

  constructor(
    @InjectRepository(<Feature>Entity)
    private readonly repository: Repository<FeatureEntity>,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async create(data: Create<Feature>Dto, userId: string) {
    this.logger.log(`Creating <feature> for user ${userId}`);
    
    const entity = this.repository.create(data);
    const saved = await this.repository.save(entity);
    
    this.auditLogger.log({
      action: '<feature>.create',
      actor: userId,
      resource_id: saved.id,
      result: 'success',
    });
    
    return saved;
  }
}
```

### Controller Template

```typescript
// <feature>/controllers/<feature>.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { <Feature>Service } from '../services/<feature>.service';
import { Create<Feature>Dto } from '../dto/create-<feature>.dto';

@Controller('<feature>')
@UseGuards(AuthGuard)
export class <Feature>Controller {
  constructor(private readonly service: <Feature>Service) {}

  @Post()
  async create(
    @Body(new ValidationPipe({ whitelist: true })) dto: Create<Feature>Dto,
    @CurrentUser() user: User,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
```

### DTO Template

```typescript
// <feature>/dto/create-<feature>.dto.ts
import { IsString, IsNumber, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class Create<Feature>Dto {
  @IsString()
  name: string;

  @IsNumber()
  amount: number;

  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  @IsOptional()
  status?: string;

  @ValidateNested({ each: true })
  @Type(() => NestedItemDto)
  items: NestedItemDto[];
}
```

### Interceptor Template

```typescript
// common/interceptors/<feature>.interceptor.ts
import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler 
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class <Feature>Interceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    
    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        // Log or record metrics
      }),
    );
  }
}
```

### Provider Template (Factory)

```typescript
// <feature>/providers/<feature>.provider.ts
import { Provider } from '@nestjs/common';

export const <FEATURE>_CLIENT = Symbol('<FEATURE>_CLIENT');

export const <feature>ClientProvider: Provider = {
  provide: <FEATURE>_CLIENT,
  useFactory: (configService: ConfigService) => {
    return createClient({
      apiKey: configService.get('<FEATURE>_API_KEY'),
      baseURL: configService.get('<FEATURE>_BASE_URL'),
    });
  },
  inject: [ConfigService],
};
```

### Module Registration

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MetricsModule } from './metrics/metrics.module';
import { <Feature>Module } from './<feature>/<feature>.module';

@Module({
  imports: [
    MetricsModule, // Global module
    <Feature>Module,
  ],
})
export class AppModule {}
```

### Testing Patterns

#### Unit Test
```typescript
// <feature>/services/<feature>.service.spec.ts
describe('<Feature>Service', () => {
  let service: <Feature>Service;
  let repository: jest.Mocked<Repository<FeatureEntity>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        <Feature>Service,
        {
          provide: getRepositoryToken(FeatureEntity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(<Feature>Service);
    repository = module.get(getRepositoryToken(FeatureEntity));
  });

  it('should create entity', async () => {
    const dto = { name: 'Test' };
    repository.create.mockReturnValue(dto as any);
    repository.save.mockResolvedValue({ id: '1', ...dto } as any);

    const result = await service.create(dto, 'user-1');
    expect(result.id).toBe('1');
  });
});
```

#### E2E Test
```typescript
// test/<feature>.e2e-spec.ts
describe('<Feature>Controller (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  it('/<feature> (POST)', () => {
    return request(app.getHttpServer())
      .post('/<feature>')
      .send({ name: 'Test' })
      .expect(201);
  });
});
```

### Common Patterns

#### Repository Pattern
```typescript
@Injectable()
export class <Feature>Repository {
  constructor(
    @InjectRepository(<Feature>Entity)
    private readonly repo: Repository<FeatureEntity>,
  ) {}

  async findByStatus(status: string) {
    return this.repo.find({ where: { status } });
  }
}
```

#### Service with Multiple Dependencies
```typescript
@Injectable()
export class ComplexService {
  constructor(
    private readonly repository: <Feature>Repository,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly auditLogger: AuditLoggerService,
    private readonly metricsService: MetricsService,
  ) {}
}
```

#### Event-Driven Pattern
```typescript
// Using EventEmitter
@Injectable()
export class <Feature>Service {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async create(data: CreateDto) {
    const result = await this.repository.save(data);
    this.eventEmitter.emit('<feature>.created', result);
    return result;
  }
}

// Listener
@Injectable()
export class <Feature>Listener {
  @OnEvent('<feature>.created')
  handleCreated(event: <Feature>Entity) {
    // Send notification, update metrics, etc.
  }
}
```

### References
- `nestjs-reference/jpm/jpm.module.ts` - Feature module example
- `nestjs-reference/metrics/metrics.module.ts` - Global module example
- `nestjs-reference/common/interceptors/` - Interceptor patterns
- `nestjs-reference/common/filters/` - Exception filter patterns
- `nestjs-test/tests/di-wiring.spec.ts` - DI testing patterns

