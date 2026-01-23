export interface DeviceFlowResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type DeviceFlowPollStatus =
  | 'pending'
  | 'success'
  | 'slow_down'
  | 'expired'
  | 'access_denied'
  | 'error'

export interface DeviceFlowPollResult {
  status: DeviceFlowPollStatus
  accessToken?: string
  error?: string
}

export interface GithubUser {
  login: string
  name: string | null
  avatarUrl: string
}

export interface GithubAuthStatus {
  connected: boolean
  user?: GithubUser
}
