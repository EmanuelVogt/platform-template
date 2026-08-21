import { ulid } from 'ulid';

export type TokenType = 'email_verify' | 'password_reset' | 'access_link' | 'email_change';

export interface VerificationTokenProps {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly type: TokenType;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateVerificationTokenInput {
  userId: string;
  tokenHash: string;
  type: TokenType;
  expiresAt: Date;
}

export class VerificationToken {
  readonly props: VerificationTokenProps;

  private constructor(props: VerificationTokenProps) {
    this.props = Object.freeze(props);
  }

  /** Hidrata a partir de props persistidas (repo). */
  static fromProps(props: VerificationTokenProps): VerificationToken {
    return new VerificationToken(props);
  }

  static create({
    userId,
    tokenHash,
    type,
    expiresAt,
  }: CreateVerificationTokenInput): VerificationToken {
    return new VerificationToken({
      id: ulid(),
      userId,
      tokenHash,
      type,
      expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    });
  }

  /** true se ainda não consumido e não expirado em `now` (`>` estrito). */
  isValid(now: Date): boolean {
    return this.props.consumedAt === null && this.props.expiresAt.getTime() > now.getTime();
  }
}
