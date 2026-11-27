import { createContext, useContext } from 'react'

export const ChatsContext = createContext(null)
export const useChats = () => useContext(ChatsContext)
