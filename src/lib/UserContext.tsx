import { createContext, useContext } from 'react'

interface UserContextValue {
  isOwner: boolean
}

export const UserContext = createContext<UserContextValue>({ isOwner: false })
export const useUser = () => useContext(UserContext)
