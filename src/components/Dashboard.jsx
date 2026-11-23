import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Users, UserPlus, Clock } from 'lucide-react'

export default function Dashboard({ session }) {
  const [activeTab, setActiveTab] = useState('friends') // friends, add, pending
  
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="font-semibold text-gray-800 truncate">
            {session.user.email}
          </div>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Logout
          </button>
        </div>
        
        {/* Navigation */}
        <div className="p-2 space-y-1">
          <button 
            onClick={() => setActiveTab('friends')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'friends' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <Users className="w-4 h-4" />
            <span>Friends</span>
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'add' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Friend</span>
          </button>
          <button 
            onClick={() => setActiveTab('pending')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'pending' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <Clock className="w-4 h-4" />
            <span>Pending Invites</span>
          </button>
        </div>
        
        {/* List Content (Placeholder for now) */}
        <div className="flex-1 overflow-y-auto p-2 border-t border-gray-100">
          {activeTab === 'friends' && (
            <div className="text-sm text-gray-500 text-center mt-4">No friends yet.</div>
          )}
          {activeTab === 'add' && (
            <div className="p-2">
              <h3 className="text-sm font-medium mb-2">Send Invite</h3>
              <Input placeholder="Friend's email address" className="mb-2" />
              <Button className="w-full">Send Request</Button>
            </div>
          )}
          {activeTab === 'pending' && (
            <div className="text-sm text-gray-500 text-center mt-4">No pending invites.</div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center bg-gray-50/50">
          <div className="text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-medium text-gray-700">Select a friend to start chatting</h2>
            <p className="text-sm mt-1">Or add a new friend from the sidebar</p>
          </div>
        </div>
      </div>
    </div>
  )
}