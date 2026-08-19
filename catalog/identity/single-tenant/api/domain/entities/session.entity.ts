import { ulid } from 'ulid';

export interface SessionProps {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly rememberMe: boolean;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly deviceId: string | null;
}

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  rememberMe: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId: string | null;
  /** Opcionais para teste/hidratação; default = agora. */
  createdAt?: Date;
  lastSeenAt?: Date;
}

export class Session {
  readonly props: SessionProps;

  private constructor(props: SessionProps) {
    this.props = Object.freeze(props);
  }

  /** Hidrata a partir de props persistidas (repo). */
  static fromProps(props: SessionProps): Session {
    return new Session(props);
  }

  static create({
    userId,
    tokenHash,
    expiresAt,
    rememberMe,
    ipAddress,
    userAgent,
    deviceId,
    createdAt,
    lastSeenAt,
  }: CreateSessionInput): Session {
    const now = new Date();
    return new Session({
      id: ulid(),
      userId,
      tokenHash,
      createdAt: createdAt ?? now,
      lastSeenAt: lastSeenAt ?? now,
      expiresAt,
      rememberMe,
      ipAddress,
      userAgent,
      deviceId,
    });
  }

  /**
   * true se a sessão expirou em `now`:
   *  - inatividade: now - lastSeenAt > idleTtlSeconds, OU
   *  - prazo absoluto: now - createdAt > absoluteTtlSeconds.
   * Bordas exatas (`==`) NÃO contam como expirado (`>` estrito).
   */
  isExpired(now: Date, idleTtlSeconds: number, absoluteTtlSeconds: number): boolean {
    const idleElapsed = (now.getTime() - this.props.lastSeenAt.getTime()) / 1000;
    const absoluteElapsed = (now.getTime() - this.props.createdAt.getTime()) / 1000;
    return idleElapsed > idleTtlSeconds || absoluteElapsed > absoluteTtlSeconds;
  }
}
