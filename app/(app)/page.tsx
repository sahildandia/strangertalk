"use client";

import { useState, useEffect, useRef } from "react";
import { Dices, Search, X, Flag, Send, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

type ChatState = "IDLE" | "SEARCHING" | "MATCHED";

export default function RandomChatPage() {
  const [chatState, setChatState] = useState<ChatState>("IDLE");
  const [messages, setMessages] = useState<{ id: string; sender: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [myGender, setMyGender] = useState<"Boy" | "Girl" | null>(null);
  const [partnerGender, setPartnerGender] = useState<"Boy" | "Girl" | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Generate a random ID for this client session
  const [myId] = useState(() => Math.random().toString(36).substring(2, 15));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const globalChannel = supabase.channel('global_presence', {
      config: { presence: { key: myId } }
    });

    globalChannel
      .on('presence', { event: 'sync' }, () => {
        const state = globalChannel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await globalChannel.track({ onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      globalChannel.unsubscribe();
    };
  }, [myId]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [channel]);

  const joinRoom = (newRoomId: string, oldChannel: RealtimeChannel | null) => {
    if (oldChannel) {
      oldChannel.unsubscribe();
    }
    
    setChatState("MATCHED");
    setMessages([{ id: "sys1", sender: "system", content: "You have been matched anonymously. Say hi!" }]);

    const chatChannel = supabase.channel(newRoomId, {
      config: { broadcast: { ack: false } }
    });
    
    chatChannel
      .on('broadcast', { event: 'message' }, (payload) => {
        setMessages(prev => [...prev, { 
          id: payload.payload.id, 
          sender: "partner", 
          content: payload.payload.content 
        }]);
      })
      .on('broadcast', { event: 'leave' }, () => {
        setMessages(prev => [...prev, { id: Date.now().toString(), sender: "system", content: "Your partner has left the chat." }]);
      })
      .subscribe();

    setChannel(chatChannel);
  };

  const handleStartSearch = () => {
    if (!myGender) {
      alert("Please select if you are a Boy or Girl before finding a partner.");
      return;
    }

    setChatState("SEARCHING");
    
    const waitingChannel = supabase.channel('waiting_room', {
      config: { presence: { key: myId }, broadcast: { ack: false } }
    });

    waitingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = waitingChannel.presenceState();
        const otherUsers = Object.keys(state).filter(id => id !== myId);
        
        if (otherUsers.length > 0) {
          const partnerId = otherUsers[0];
          // @ts-expect-error: Suppressing TS error as gender might not be strongly typed on presence state
          const pGender = state[partnerId]?.[0]?.gender || "Unknown";
          
          if (myId < partnerId) {
            const newRoomId = `room-${Date.now()}-${myId}`;
            
            setPartnerGender(pGender);
            
            waitingChannel.send({
              type: 'broadcast',
              event: 'match_invite',
              payload: { to: partnerId, roomId: newRoomId, myGender }
            });
            
            joinRoom(newRoomId, waitingChannel);
          }
        }
      })
      .on('broadcast', { event: 'match_invite' }, (payload) => {
        if (payload.payload.to === myId) {
          setPartnerGender(payload.payload.myGender || "Unknown");
          joinRoom(payload.payload.roomId, waitingChannel);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await waitingChannel.track({ status: 'waiting', joinedAt: Date.now(), gender: myGender });
        }
      });
      
    setChannel(waitingChannel);
  };

  const handleCancelSearch = () => {
    setChatState("IDLE");
    setPartnerGender(null);
    if (channel) {
      channel.unsubscribe();
      setChannel(null);
    }
  };

  const handleEndChat = () => {
    setChatState("IDLE");
    setMessages([]);
    setPartnerGender(null);
    if (channel) {
      channel.send({ type: 'broadcast', event: 'leave', payload: {} });
      channel.unsubscribe();
      setChannel(null);
    }
  };

  const handleNext = () => {
    handleEndChat();
    setTimeout(() => {
      handleStartSearch();
    }, 100);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !channel) return;
    
    const msgId = Date.now().toString();
    
    channel.send({
      type: 'broadcast',
      event: 'message',
      payload: { id: msgId, content: input }
    });
    
    setMessages(prev => [...prev, { id: msgId, sender: "me", content: input }]);
    setInput("");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-50 p-2 sm:p-4 md:p-6 flex flex-col selection:bg-blue-500/30">
      <header className="mb-2 sm:mb-4 flex justify-between items-center px-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 tracking-tight">StrangerTalk</h1>
          <div className="flex items-center gap-3 mt-0.5 sm:mt-1">
            <p className="text-slate-500 text-xs sm:text-sm">Connect instantly. Talk freely.</p>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] sm:text-xs text-slate-700">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
              {onlineCount} online
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl relative">
        {/* Glow behind the chat box */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-blue-600/10 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none" />
        {chatState === "IDLE" && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center relative z-10">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-full flex items-center justify-center mb-6 sm:mb-8 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <Dices className="w-10 h-10 sm:w-12 sm:h-12 text-blue-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-slate-900 tracking-tight">Ready to meet someone?</h2>
            <p className="text-slate-500 max-w-md mb-6 sm:mb-8 text-base sm:text-lg leading-relaxed">
              You will be matched with another stranger anonymously. Be respectful and have fun.
            </p>

            <div className="flex gap-3 sm:gap-4 mb-8 sm:mb-10 w-full max-w-[16rem] sm:max-w-xs">
              <button 
                onClick={() => setMyGender("Boy")}
                className={`flex-1 py-2.5 sm:py-3 rounded-full font-bold transition-all border text-sm sm:text-base ${
                  myGender === "Boy" 
                    ? "bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]" 
                    : "bg-white border-slate-300 text-slate-500 hover:bg-slate-100"
                }`}
              >
                👦 Boy
              </button>
              <button 
                onClick={() => setMyGender("Girl")}
                className={`flex-1 py-2.5 sm:py-3 rounded-full font-bold transition-all border text-sm sm:text-base ${
                  myGender === "Girl" 
                    ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]" 
                    : "bg-white border-slate-300 text-slate-500 hover:bg-slate-100"
                }`}
              >
                👧 Girl
              </button>
            </div>

            <button 
              onClick={handleStartSearch}
              disabled={!myGender}
              className={`group relative flex items-center justify-center gap-2 sm:gap-3 w-full max-w-[16rem] sm:max-w-xs px-6 sm:px-10 py-4 sm:py-5 rounded-full font-bold text-base sm:text-lg transition-all ${
                myGender 
                  ? "bg-white hover:bg-neutral-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95" 
                  : "bg-slate-100 text-slate-400 cursor-not-allowed opacity-70"
              }`}
            >
              <Search className={`w-5 h-5 sm:w-6 sm:h-6 transition-transform ${myGender ? "group-hover:rotate-12" : ""}`} />
              Find a Partner
            </button>
          </div>
        )}

        {chatState === "SEARCHING" && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center relative z-10">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-full flex items-center justify-center mb-6 sm:mb-8 shadow-[0_0_30px_rgba(59,130,246,0.2)] animate-pulse">
              <Search className="w-10 h-10 sm:w-12 sm:h-12 text-blue-400 animate-spin-slow" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-slate-900 tracking-tight">Searching for someone...</h2>
            <p className="text-slate-500 max-w-md mb-8 sm:mb-10 text-base sm:text-lg leading-relaxed">
              This might take a moment depending on how many people are online.
            </p>
            <button 
              onClick={handleCancelSearch}
              className="flex items-center gap-2 sm:gap-3 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 sm:px-8 py-3 sm:py-4 rounded-full font-medium text-base sm:text-lg transition-colors border border-slate-300"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
              Cancel Search
            </button>
          </div>
        )}

        {chatState === "MATCHED" && (
          <div className="flex-1 flex flex-col h-full relative z-10 bg-slate-50/40">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex justify-between items-center bg-white/90 backdrop-blur-md">
              <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 bg-slate-100 border border-slate-300 rounded-full flex items-center justify-center shadow-inner">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">
                    Anonymous {partnerGender && <span className="text-slate-400 font-normal ml-1">({partnerGender})</span>}
                  </h3>
                  <span className="text-[10px] sm:text-xs text-green-400 flex items-center gap-1.5 font-medium tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse"></span>
                    Online
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
                <button title="Report" className="p-2 sm:p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors">
                  <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button onClick={handleNext} className="px-3 py-1.5 sm:px-5 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 hover:border-slate-400 rounded-full font-medium text-xs sm:text-sm transition-all active:scale-95">
                  Skip
                </button>
                <button onClick={handleEndChat} className="px-3 py-1.5 sm:px-5 sm:py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-full font-medium text-xs sm:text-sm transition-all flex items-center gap-1 sm:gap-2 active:scale-95">
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">End</span>
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 sm:p-6 overflow-y-auto flex flex-col gap-4 sm:gap-5">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${
                    msg.sender === "system" ? "self-center items-center my-4 sm:my-6" : 
                    msg.sender === "me" ? "self-end items-end" : "self-start items-start"
                  }`}
                >
                  {msg.sender === "system" ? (
                    <span className="bg-slate-100 backdrop-blur-sm border border-slate-200 text-slate-500 text-[10px] sm:text-xs px-3 sm:px-4 py-1 sm:py-1.5 rounded-full uppercase tracking-wider font-medium text-center">
                      {msg.content}
                    </span>
                  ) : (
                    <div className={`px-4 sm:px-5 py-2 sm:py-3 rounded-2xl shadow-sm text-sm sm:text-[15px] leading-relaxed break-words ${
                      msg.sender === "me" 
                        ? "bg-blue-600 text-white rounded-tr-sm" 
                        : "bg-slate-100 border border-slate-300 text-slate-800 rounded-tl-sm"
                    }`}>
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-2 sm:p-4 border-t border-slate-200 bg-white/90 backdrop-blur-md flex gap-2 sm:gap-3">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type a message..." 
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 rounded-full px-4 sm:px-6 py-2.5 sm:py-3.5 text-base text-slate-800 placeholder-slate-400 outline-none transition-all shadow-inner"
              />
              <button 
                type="submit"
                disabled={!input.trim()}
                className="w-10 h-10 sm:w-14 sm:h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-full transition-all active:scale-90 flex-shrink-0 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5 sm:ml-1" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
