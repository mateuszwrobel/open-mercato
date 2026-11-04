export type SecurityScope = 'platform' | 'tenant' | 'organization'

export type MfaMethodType = 'totp' | 'passkey' | 'otp_email' | string

export type MfaMethod = {
  id: string
  type: string
  label: string | null
  providerMetadata: Record<string, unknown> | null
  lastUsedAt: string | null
  createdAt: string
}

export type MfaProvider = {
  type: string
  label: string
  icon: string
  allowMultiple: boolean
  components?: {
    setup?: string
    list?: string
    details?: string
    challenge?: string
  }
}

export type MfaChallengeMethod = {
  type: string
  label: string
  icon: string
  components?: {
    list?: string
    details?: string
    challenge?: string
  }
}

export type ProviderSetupComponentProps = {
  provider: MfaProvider
  onComplete: (recoveryCodes: string[]) => void
  onCancel: () => void
}

export type ProviderListComponentProps = {
  provider: MfaProvider
  configuredCount: number
  onClick: () => void
}

export type ProviderDetailsComponentProps = {
  provider: MfaProvider
  methods: MfaMethod[]
  saving: boolean
  onRemoveMethod: (method: MfaMethod) => Promise<void>
  onMethodsChanged: () => Promise<void>
}

export type ProviderChallengeComponentProps = {
  method: MfaChallengeMethod
  loading: boolean
  onVerify: (payload: Record<string, unknown>) => Promise<void>
  onPrepare: () => Promise<Record<string, unknown> | undefined>
  onResend?: () => Promise<unknown>
  submitLabel: string
}

export interface SecurityModuleConfig {
  enableMfa: boolean
  enableSudo: boolean
}
