import { createContext, useContext } from 'react'

/** enabled + enable(password) / disable(password); both verify the password first and throw a readable Error. */
export const AppLockContext = createContext({ enabled: false, enable: async () => {}, disable: async () => {} })
export const useAppLock = () => useContext(AppLockContext)
