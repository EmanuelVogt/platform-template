import { InvalidAccountStateError, InvalidBirthDateError } from '../errors';

import { User } from './user.entity';

const THRESHOLD = 5;
const DURATION = 900; // 15 min

function buildUser(overrides: Partial<Parameters<typeof User.create>[0]> = {}): User {
  return User.createActive({
    name: 'Ana',
    email: 'ana@example.com',
    passwordHash: 'hash',
    pepperVersion: 1,
    ...overrides,
  });
}

describe('User.create', () => {
  it('gera id ULID, emailVerified=false, attempts=0, lockedUntil=null, timestamps', () => {
    const user = buildUser();
    expect(user.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(user.props.emailVerified).toBe(false);
    expect(user.props.failedLoginAttempts).toBe(0);
    expect(user.props.lockedUntil).toBeNull();
    expect(user.props.createdAt).toBeInstanceOf(Date);
    expect(user.props.updatedAt).toBeInstanceOf(Date);
  });

  it('normaliza email para lowercase', () => {
    const user = buildUser({ email: 'Ana@Example.COM', accessProfile: 'admin' });
    expect(user.props.email).toBe('ana@example.com');
  });

  it('nasce fora do atendimento a hóspede, e entra quando pedido', () => {
    expect(
      User.create({ name: 'Ana', email: 'a@b.com', accessProfile: 'professional' }).props
        .attendsGuests,
    ).toBe(false);
    expect(
      User.create({
        name: 'Bia',
        email: 'b@b.com',
        accessProfile: 'professional',
        attendsGuests: true,
      }).props.attendsGuests,
    ).toBe(true);
  });

  it('registra quem criou a conta', () => {
    const user = User.create({ name: 'Ana', email: 'a@b.com', accessProfile: 'admin', createdByUserId: 'admin-1' });
    expect(user.props.createdByUserId).toBe('admin-1');
    expect(User.create({ name: 'B', email: 'b@b.com', accessProfile: 'admin' }).props.createdByUserId).toBeNull();
  });
});

describe('User.isLocked (clock injetado)', () => {
  it('false quando lockedUntil é null', () => {
    const user = buildUser();
    expect(user.isLocked(new Date('2026-01-01T00:00:00Z'))).toBe(false);
  });

  it('true quando lockedUntil > now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const user = User.fromProps({
      ...buildUser().props,
      lockedUntil: new Date('2026-01-01T00:10:00Z'),
    });
    expect(user.isLocked(now)).toBe(true);
  });

  it('borda: lockedUntil == now conta como NÃO locked (> estrito)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const user = User.fromProps({ ...buildUser().props, lockedUntil: new Date(now) });
    expect(user.isLocked(now)).toBe(false);
  });

  it('false quando lockedUntil já passou', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const user = User.fromProps({
      ...buildUser().props,
      lockedUntil: new Date('2025-12-31T23:59:59Z'),
    });
    expect(user.isLocked(now)).toBe(false);
  });
});

describe('User.registerFailedAttempt (máquina de lockout)', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('incrementa attempts sem lockear antes do threshold', () => {
    const user = buildUser();
    const updated = user.registerFailedAttempt(now, THRESHOLD, DURATION);
    expect(updated.props.failedLoginAttempts).toBe(1);
    expect(updated.props.lockedUntil).toBeNull();
  });

  it('ao atingir threshold, seta lockedUntil = now + durationSeconds', () => {
    const user = User.fromProps({ ...buildUser().props, failedLoginAttempts: THRESHOLD - 1 });
    const updated = user.registerFailedAttempt(now, THRESHOLD, DURATION);
    expect(updated.props.failedLoginAttempts).toBe(THRESHOLD);
    expect(updated.props.lockedUntil).toEqual(new Date(now.getTime() + DURATION * 1000));
  });

  it('acima do threshold continua re-aplicando lock a partir de now', () => {
    const user = User.fromProps({ ...buildUser().props, failedLoginAttempts: THRESHOLD });
    const updated = user.registerFailedAttempt(now, THRESHOLD, DURATION);
    expect(updated.props.failedLoginAttempts).toBe(THRESHOLD + 1);
    expect(updated.props.lockedUntil).toEqual(new Date(now.getTime() + DURATION * 1000));
  });

  it('retorna nova instância sem mutar a original', () => {
    const user = buildUser();
    const updated = user.registerFailedAttempt(now, THRESHOLD, DURATION);
    expect(updated).not.toBe(user);
    expect(user.props.failedLoginAttempts).toBe(0);
    expect(user.props.lockedUntil).toBeNull();
  });
});

describe('User.clearLockout', () => {
  it('zera attempts e lockedUntil', () => {
    const user = User.fromProps({
      ...buildUser().props,
      failedLoginAttempts: 5,
      lockedUntil: new Date('2026-01-01T00:10:00Z'),
    });
    const updated = user.clearLockout();
    expect(updated.props.failedLoginAttempts).toBe(0);
    expect(updated.props.lockedUntil).toBeNull();
  });

  it('retorna nova instância sem mutar a original', () => {
    const user = User.fromProps({ ...buildUser().props, failedLoginAttempts: 5 });
    const updated = user.clearLockout();
    expect(updated).not.toBe(user);
    expect(user.props.failedLoginAttempts).toBe(5);
  });
});

describe('User — transições de senha/verificação/throttle', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('rehashPassword troca o hash em nova instância sem mutar a original', () => {
    const user = buildUser();
    const updated = user.rehashPassword('novo-hash');
    expect(updated.props.passwordHash).toBe('novo-hash');
    expect(updated).not.toBe(user);
    expect(user.props.passwordHash).toBe('hash');
  });

  it('verifyEmail marca emailVerified sem mutar a original', () => {
    const user = buildUser();
    const updated = user.verifyEmail();
    expect(updated.props.emailVerified).toBe(true);
    expect(user.props.emailVerified).toBe(false);
  });

  it('markResetRequested carimba o instante sem mutar a original', () => {
    const user = buildUser();
    const updated = user.markResetRequested(now);
    expect(updated.props.lastResetRequestedAt).toEqual(now);
    expect(user.props.lastResetRequestedAt).toBeNull();
  });

  it('markVerificationRequested carimba campo separado do reset', () => {
    const user = buildUser();
    const updated = user.markVerificationRequested(now);
    expect(updated.props.lastVerificationRequestedAt).toEqual(now);
    expect(updated.props.lastResetRequestedAt).toBeNull();
    expect(user.props.lastVerificationRequestedAt).toBeNull();
  });
});

describe('User — imutabilidade em runtime', () => {
  it('props é congelado: escrita direta lança', () => {
    const user = buildUser();
    expect(() => {
      (user.props as { emailVerified: boolean }).emailVerified = true;
    }).toThrow();
  });
});

describe('User — criação', () => {
  it('create() cria usuário pending, sem senha, não-verificado, não-master', () => {
    const user = User.create({ name: 'Ana', email: 'ANA@Example.com', accessProfile: 'admin' });
    expect(user.props.status).toBe('pending');
    expect(user.props.passwordHash).toBeNull();
    expect(user.props.emailVerified).toBe(false);
    expect(user.props.accessProfile).toBe('admin');
    expect(user.props.email).toBe('ana@example.com');
  });

  it('create() segue ativo com senha', () => {
    const user = User.createActive({
      name: 'Bia',
      email: 'bia@example.com',
      passwordHash: 'argon2',
      pepperVersion: 1,
    });
    expect(user.props.status).toBe('active');
    expect(user.props.passwordHash).toBe('argon2');
  });

  it('activate() ativa, verifica, seta senha/nome/nascimento (nova instância)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const pending = User.create({ name: 'Ana', email: 'ana@example.com', accessProfile: 'admin' });
    const active = pending.activate(
      {
        passwordHash: 'argon2-novo',
        name: '  Ana Maria  ',
        birthDate: '1990-05-20',
        avatarAttachmentId: null,
      },
      now,
    );
    expect(active).not.toBe(pending);
    expect(active.props.status).toBe('active');
    expect(active.props.emailVerified).toBe(true);
    expect(active.props.passwordHash).toBe('argon2-novo');
    expect(active.props.name).toBe('Ana Maria'); // trim
    expect(active.props.birthDate).toBe('1990-05-20');
    expect(active.props.updatedAt).toEqual(now);
    expect(pending.props.status).toBe('pending'); // imutabilidade
  });

  it('activate() seta o avatar resolvido', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const pending = User.create({ name: 'Ana', email: 'ana@example.com', accessProfile: 'admin' });
    const active = pending.activate(
      { passwordHash: 'h', name: 'Ana', birthDate: '1990-05-20', avatarAttachmentId: 'att-1' },
      now,
    );
    expect(active.props.avatarAttachmentId).toBe('att-1');
  });

  it('activate() em usuário não-pending lança InvalidAccountStateError', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const active = User.createActive({
      name: 'Bia',
      email: 'bia@example.com',
      passwordHash: 'argon2',
      pepperVersion: 1,
    });
    expect(() =>
      active.activate({ passwordHash: 'h', name: 'Bia', birthDate: '1990-05-20', avatarAttachmentId: null }, now),
    ).toThrow(InvalidAccountStateError);
  });

  it('activate() com data futura lança InvalidBirthDateError', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const pending = User.create({ name: 'Ana', email: 'ana@example.com', accessProfile: 'admin' });
    expect(() =>
      pending.activate({ passwordHash: 'h', name: 'Ana', birthDate: '2099-01-01', avatarAttachmentId: null }, now),
    ).toThrow(InvalidBirthDateError);
  });

  it('activate() com idade > 120 lança InvalidBirthDateError', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const pending = User.create({ name: 'Ana', email: 'ana@example.com', accessProfile: 'admin' });
    expect(() =>
      pending.activate({ passwordHash: 'h', name: 'Ana', birthDate: '1850-01-01', avatarAttachmentId: null }, now),
    ).toThrow(InvalidBirthDateError);
  });

  it('activate() com data impossível (31/02) lança InvalidBirthDateError', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const pending = User.create({ name: 'Ana', email: 'ana@example.com', accessProfile: 'admin' });
    expect(() =>
      pending.activate({ passwordHash: 'h', name: 'Ana', birthDate: '2000-02-31', avatarAttachmentId: null }, now),
    ).toThrow(InvalidBirthDateError);
  });
});

describe('User.restore', () => {
  it('limpa deletedAt e mantém status/senha', () => {
    const deleted = buildUser().delete(new Date('2026-06-10T12:00:00.000Z'));
    const restored = deleted.restore();
    expect(restored.isDeleted()).toBe(false);
    expect(restored.props.status).toBe(deleted.props.status);
    expect(restored.props.passwordHash).toBe(deleted.props.passwordHash);
  });

  it('lança InvalidAccountStateError se a conta não está excluída', () => {
    expect(() => buildUser().restore()).toThrow(InvalidAccountStateError);
  });
});

describe('User.updateProfile', () => {
  it('atualiza nome e perfil retornando nova instância', () => {
    const user = User.create({ name: 'Ana', email: 'ana@x.test', accessProfile: 'admin' });
    const now = new Date('2026-06-12T12:00:00Z');
    const updated = user.updateProfile(
      { name: ' Bia ', accessProfile: 'professional', attendsGuests: false },
      now,
    );
    expect(updated).not.toBe(user);
    expect(updated.props.name).toBe('Bia');
    expect(updated.props.accessProfile).toBe('professional');
    expect(updated.props.updatedAt).toBe(now);
    expect(user.props.accessProfile).toBe('admin');
  });

  it('liga o atendimento a hóspede sem mexer no perfil', () => {
    const user = User.create({ name: 'Ana', email: 'ana@x.test', accessProfile: 'professional' });
    const updated = user.updateProfile(
      { name: 'Ana', accessProfile: 'professional', attendsGuests: true },
      new Date('2026-06-12T12:00:00Z'),
    );
    expect(updated.props.attendsGuests).toBe(true);
    expect(updated.props.accessProfile).toBe('professional');
  });

  it('desliga o atendimento a hóspede preservando a instância anterior', () => {
    const user = User.create({
      name: 'Ana',
      email: 'ana@x.test',
      accessProfile: 'professional',
      attendsGuests: true,
    });
    const updated = user.updateProfile(
      { name: 'Ana', accessProfile: 'professional', attendsGuests: false },
      new Date('2026-06-12T12:00:00Z'),
    );
    expect(updated.props.attendsGuests).toBe(false);
    expect(user.props.attendsGuests).toBe(true);
  });
});

describe('User.isMaster', () => {
  it('true só quando accessProfile=master', () => {
    expect(User.create({ name: 'A', email: 'a@x.test', accessProfile: 'master' }).isMaster()).toBe(true);
    expect(User.create({ name: 'B', email: 'b@x.test', accessProfile: 'admin' }).isMaster()).toBe(false);
  });
});

describe('User.updateOwnProfile', () => {
  const now = new Date('2026-06-12T12:00:00Z');

  it('atualiza nome (trim) e nascimento sem tocar em accessProfile/email', () => {
    const user = buildUser({ email: 'ana@x.test' });
    const updated = user.updateOwnProfile({ name: '  Ana Maria  ', birthDate: '1990-05-20' }, now);
    expect(updated).not.toBe(user);
    expect(updated.props.name).toBe('Ana Maria');
    expect(updated.props.birthDate).toBe('1990-05-20');
    expect(updated.props.accessProfile).toBe(user.props.accessProfile);
    expect(updated.props.email).toBe('ana@x.test');
    expect(updated.props.updatedAt).toEqual(now);
  });

  it('rejeita data de nascimento inválida', () => {
    const user = buildUser();
    expect(() => user.updateOwnProfile({ name: 'Ana', birthDate: '2099-01-01' }, now)).toThrow(
      InvalidBirthDateError,
    );
  });
});

describe('User.setAvatar', () => {
  it('troca avatarAttachmentId em nova instância', () => {
    const now = new Date('2026-06-12T12:00:00Z');
    const user = buildUser();
    const updated = user.setAvatar('att-9', now);
    expect(updated).not.toBe(user);
    expect(updated.props.avatarAttachmentId).toBe('att-9');
    expect(updated.props.updatedAt).toEqual(now);
    expect(user.props.avatarAttachmentId).toBeNull();
  });
});

describe('User — troca de e-mail self-service', () => {
  const now = new Date('2026-06-12T12:00:00Z');

  it('requestEmailChange desativa a conta e guarda pendingEmail sem destruir o email atual', () => {
    const user = buildUser({ email: 'ana@x.test' });
    const requested = user.requestEmailChange('NOVA@X.test', now);
    expect(requested).not.toBe(user);
    expect(requested.props.status).toBe('pending');
    expect(requested.props.emailVerified).toBe(false);
    expect(requested.props.email).toBe('ana@x.test'); // antigo preservado
    expect(requested.props.pendingEmail).toBe('nova@x.test'); // lowercase
    expect(requested.props.lastEmailChangeRequestedAt).toEqual(now);
    expect(requested.hasPendingEmailChange()).toBe(true);
    expect(user.props.status).toBe('active'); // imutabilidade
  });

  it('requestEmailChange em conta não-active lança InvalidAccountStateError', () => {
    const pending = User.create({ name: 'Ana', email: 'ana@x.test', accessProfile: 'admin' });
    expect(() => pending.requestEmailChange('nova@x.test', now)).toThrow(InvalidAccountStateError);
  });

  it('confirmEmailChange promove pendingEmail a email e reativa a conta', () => {
    const requested = buildUser({ email: 'ana@x.test' }).requestEmailChange('nova@x.test', now);
    const confirmed = requested.confirmEmailChange(new Date('2026-06-12T12:30:00Z'));
    expect(confirmed.props.email).toBe('nova@x.test');
    expect(confirmed.props.pendingEmail).toBeNull();
    expect(confirmed.props.status).toBe('active');
    expect(confirmed.props.emailVerified).toBe(true);
    expect(confirmed.hasPendingEmailChange()).toBe(false);
  });

  it('confirmEmailChange sem troca pendente lança InvalidAccountStateError', () => {
    expect(() => buildUser().confirmEmailChange(now)).toThrow(InvalidAccountStateError);
  });

  it('cancelEmailChange reativa com o e-mail antigo e descarta pendingEmail', () => {
    const requested = buildUser({ email: 'ana@x.test' }).requestEmailChange('nova@x.test', now);
    const cancelled = requested.cancelEmailChange(new Date('2026-06-12T13:00:00Z'));
    expect(cancelled.props.email).toBe('ana@x.test');
    expect(cancelled.props.pendingEmail).toBeNull();
    expect(cancelled.props.status).toBe('active');
  });

  it('cancelEmailChange sem troca pendente lança InvalidAccountStateError', () => {
    expect(() => buildUser().cancelEmailChange(now)).toThrow(InvalidAccountStateError);
  });

  it('hasPendingEmailChange retorna false quando não há troca pendente', () => {
    expect(buildUser().hasPendingEmailChange()).toBe(false);
  });

  it('confirmEmailChange preserva updatedAt com o instante passado', () => {
    const confirmAt = new Date('2026-06-12T13:00:00Z');
    const confirmed = buildUser({ email: 'ana@x.test' })
      .requestEmailChange('nova@x.test', now)
      .confirmEmailChange(confirmAt);
    expect(confirmed.props.updatedAt).toEqual(confirmAt);
  });

  it('cancelEmailChange preserva updatedAt e mantém emailVerified inalterado', () => {
    const cancelAt = new Date('2026-06-12T14:00:00Z');
    const cancelled = buildUser({ email: 'ana@x.test' })
      .requestEmailChange('nova@x.test', now)
      .cancelEmailChange(cancelAt);
    expect(cancelled.props.updatedAt).toEqual(cancelAt);
    // emailVerified não é resetado pelo cancel — fica como estava após o requestEmailChange
    expect(cancelled.props.emailVerified).toBe(false);
  });
});

describe('User.delete e isDeleted', () => {
  const now = new Date('2026-06-16T10:00:00Z');

  it('delete() marca deletedAt e updatedAt na nova instância', () => {
    const user = buildUser();
    const deleted = user.delete(now);
    expect(deleted).not.toBe(user);
    expect(deleted.props.deletedAt).toEqual(now);
    expect(deleted.props.updatedAt).toEqual(now);
    expect(user.props.deletedAt).toBeNull();
  });

  it('isDeleted() retorna true após delete()', () => {
    expect(buildUser().delete(now).isDeleted()).toBe(true);
  });

  it('isDeleted() retorna false para usuário ativo', () => {
    expect(buildUser().isDeleted()).toBe(false);
  });
});

describe('User.registerFailedAttempt — preservação do lockedUntil existente', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('abaixo do threshold preserva lockedUntil pré-existente (não zera)', () => {
    const preExistingLock = new Date('2026-01-01T00:10:00Z');
    // failedLoginAttempts=1, threshold=10 → não atinge → lockedUntil permanece
    const user = User.fromProps({
      ...buildUser().props,
      failedLoginAttempts: 1,
      lockedUntil: preExistingLock,
    });
    const updated = user.registerFailedAttempt(now, 10, DURATION);
    expect(updated.props.lockedUntil).toEqual(preExistingLock);
  });
});

describe('assertValidBirthDate — ramos internos via activate()', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  function pendingUser(): User {
    return User.create({ name: 'Ana', email: 'ana@example.com', accessProfile: 'admin' });
  }

  it('data válida no passado próximo é aceita sem lançar', () => {
    expect(() =>
      pendingUser().activate(
        { passwordHash: 'h', name: 'Ana', birthDate: '1990-01-01', avatarAttachmentId: null },
        now,
      ),
    ).not.toThrow();
  });

  it('data com dia inválido para o mês (29/02 em ano não-bissexto) lança InvalidBirthDateError', () => {
    // 2001-02-29 não existe: Date UTC promove para 2001-03-01 → UTCDate != 29
    expect(() =>
      pendingUser().activate(
        { passwordHash: 'h', name: 'Ana', birthDate: '2001-02-29', avatarAttachmentId: null },
        now,
      ),
    ).toThrow(InvalidBirthDateError);
  });

  it('data com dia zero (2000-01-00) lança InvalidBirthDateError', () => {
    // parsed não representa dia 0 — UTCDate vira 31 (dia anterior ao mês)
    expect(() =>
      pendingUser().activate(
        { passwordHash: 'h', name: 'Ana', birthDate: '2000-01-00', avatarAttachmentId: null },
        now,
      ),
    ).toThrow(InvalidBirthDateError);
  });
});

describe('User.updateOwnProfile — birthDate opcional', () => {
  const now = new Date('2026-06-16T10:00:00Z');

  it('sem birthDate mantém o valor anterior intacto sem validar', () => {
    const user = User.fromProps({
      ...buildUser().props,
      birthDate: '1985-03-15',
    });
    const updated = user.updateOwnProfile({ name: 'Novo Nome' }, now);
    expect(updated.props.birthDate).toBe('1985-03-15');
    expect(updated.props.name).toBe('Novo Nome');
    expect(updated.props.updatedAt).toEqual(now);
  });

  it('birthDate undefined com birthDate atual null mantém null', () => {
    const user = User.fromProps({ ...buildUser().props, birthDate: null });
    const updated = user.updateOwnProfile({ name: 'X' }, now);
    expect(updated.props.birthDate).toBeNull();
  });

  it('idade exatamente acima de 120 anos lança InvalidBirthDateError', () => {
    // 1905-01-02 está dentro de 120 anos de 2026-01-01, mas 1900-01-01 não está
    const farPast = new Date('2026-06-16T10:00:00Z');
    const user = buildUser();
    expect(() => user.updateOwnProfile({ name: 'Ana', birthDate: '1905-06-15' }, farPast)).toThrow(
      InvalidBirthDateError,
    );
  });
});
