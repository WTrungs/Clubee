import { httpClient } from '@/api/httpClient'
import type {
  ChangePasswordRequest,
  CurrentUser,
  EmailChangeReceipt,
  EmailChangeRequest,
  LoginRequest,
  Profile,
  RegisterRequest,
  RegisterResponse,
  UpdateProfileRequest,
} from './accountTypes'

export const accountRepository = {
  getMe: () => httpClient.get<CurrentUser>('/me'),
  login: (request: LoginRequest) => httpClient.post<CurrentUser>('/auth/login', request),
  logout: () => httpClient.post<void>('/auth/logout'),
  register: (request: RegisterRequest) => httpClient.post<RegisterResponse>('/auth/register', request),
  requestPasswordReset: (email: string) => httpClient.post<void>('/auth/password-reset-requests', { email }),
  /** FR-ACC-05. */
  getProfile: () => httpClient.get<Profile>('/me/profile'),
  updateProfile: (request: UpdateProfileRequest) => httpClient.patch<Profile>('/me/profile', request),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return httpClient.post<Profile>('/me/avatar', form)
  },
  requestEmailChange: (request: EmailChangeRequest) => httpClient.post<EmailChangeReceipt>('/me/email-change-requests', request),
  /** FR-ACC-04. */
  changePassword: (request: ChangePasswordRequest) => httpClient.post<void>('/me/password', request),
}
