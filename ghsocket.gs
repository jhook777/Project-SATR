    // Project SATR: Stateful Async TRansmissions for Grey Hack's blockchain.so API
    //// ghsocket.so v 0.8.3 for 1337comm5 by Plu70
    ////// 2025-2026, all rights reserved
    //// Made for use ONLY in the video game GREY HACK by Loading Home Studios.
    // Released under the MIT license.
    // Virtual socket over subwallet info fields using the 1337coin 1337comm5 network.
    // My first time writing something like this. Trying to do it with modern coding techniques so future folks can use it.
    // Design Direction:
    //
    // * Stated sessions
    // * Fixed layout
    // * Deterministic offsets
    // * EOP marker
    // * Identity binding via ppub
    // * Session binding via sid
    // * Payload trimming
    // * Dynamic Metadata
    // * Stale session purging
    // * Extensibility
    //
    // roadmap: group chat, money requests, offline messages, encryption, multi-packet transmissions (currently packets are 'one-in-flight' )
    //
    //
    //
    //
    //
    /////////////////////////////////////  Global Color Definitions ///////////////////
    colorRed =          "<color=#FF0000FF><b>"
    colorCyan =         "<color=#00FFFFFF><b>"
    colorGold =         "<color=#CCCC00FF><b>"
    colorGrey =         "<color=#71858DFF><b>"
    colorGreen =        "<color=#00FF00FF><b>"
    colorOlive =        "<color=#048004FF><b>"
    colorWhite =        "<color=#FFFFFFFF><b>"
    colorBlack =        "<color=#000000FF><b>"
    colorOrange =       "<color=#FF8400FF><b>"
    colorViolet =       "<color=#8821FDFF><b>"
    colorMagenta =      "<color=#FF00C8FF><b>"
    colorLightBlue =    "<color=#2382FFFF><b>"
    // default color for standard print override, adjust to your theme
    // use "" if you wish to use your default terminal color instead
    colorDefault =      "<color=#00FF00FF>"
    colorError =        "<color=#FF0000FF><b>"
    colorWarning =      "<color=#FF8400FF><b>"
    CT =                "</color></b>"

    ghsocket = {}
    ghsocket.classID = "ghsocket"

    // imports
    import_code("/root/src/nicknames.gs") // ghsocket.nicknames{ {n,v},{n,v},{n,v},....} // n = name, v = value (price)

    // CONSTANTS
    ghsocket.SIG = "GH"
    ghsocket.VER = "8" // leaving this at 0 till release, then moving it to 1
    ghsocket.MINV = "0" // eventually we can poll the 'master' subwallet for the allowed versions
    ghsocket.PATCH = "3" // and disable out-of-date clients to avoid conflicts caused by updates
    ghsocket.NICKNAME_SIZE = 14 // maximum nickname length
    ghsocket.PAYLOAD_SIZE = 64 // maximum size of payload per packet. edit to optimize num-transmissions vs non-packet meta-data available in subwallet info. ie: larger payload == larger packet == less room for non-packet data
    ghsocket.MAX_MESSAGE_LENGTH = 320 // maximum length of input buffer. edit to optimize throughtput vs bandwidth
                                        // payloads will be sent in PAYLOAD_SIZE chunks
                                        // default 320 == 5 (five) 64 char chunks
    ghsocket.PACKET_SIZE = 156 // maximum size of packet per transmission
    // ghsocket.MIN_INFO = 64
    ghsocket.MAX_INFO = 256 // maximum number of characters a subwallet may hold in total. subwallet meta-data + packet data must not exceed this size
    // 
    // TIMEOUTS
    ghsocket.TIMEOUT = 5 // seconds until we retry; ~50 seconds
    ghsocket.MAX_TIMEOUTS = 10 // generic, for testing
    ghsocket.MAX_SYN_TIMEOUTS = 25                       // number of allowed timeouts until we stop trying to SYN and close the socket
                                                    // retries must send the original sid with an updated timestamp
                                                    // this can avoid situations where the ack was sent but not read (overwritten, perhaps) 
                                                        // and then the SYN is ignored for being an already read packet
                                                    // aside from a different timestamp, packet is otherwise identical to first sent
                                                    // this only applies to SYN requests
                                                        // tx timeouts resend the exact same packet as was lost
    ghsocket.MAX_TRANSMISSION_TIMEOUTS = 9     // number of allowed timeouts before last timeout drops packet and continues
                                                    // tx timeouts resend the exact same packet as was lost; no new timestamp
    ghsocket.MAX_SOCKET_TIMEOUTS = 120          // number of allowed timeouts before listener/host/joiner declares the socket stale due to not receiving any packets    
                                            // all timeouts may be configured and/or disabled by the host or joiner for their own sessions // soon
    //
    // FLAGS
    // transport layer
    ghsocket.SYN    = "S" // synchronize
    ghsocket.ACK    = "A" // acknowledge
    ghsocket.LST    = "L" // listen
    ghsocket.TRM    = "T" // terminate
    ghsocket.RST    = "R" // reset
    // session layer
    ghsocket.JOIN   = "J"
    ghsocket.ACCEPT = "C"
    ghsocket.DENY   = "D"
    // server layer
    ghsocket.PING   = "I"
    ghsocket.SERVER = "V"
    // future possibilities
    // ghsocket.GROUP = "G" // pause traffic to allow a joiner to join an already active chat
    // ghsocket.SLEEP = "P" // pause timeouts, prevent listeners from sending acks until wakeup signal received
    // ghsocket.WAKE  = "W" // wake a paused session, resuming timeouts and acks
    // ghsocket.HTTP  = "H" // transition to "send http over socket" mode, halting transmissions until complete. 
        // this will require multiple packets as well as safeguards to protect against possible code injection into the comm5 app.
        // due to size and time constraints these payloads will not be encrypted
          // i'll look into compression options as well
    // ghsocket.FILE  = "F" // initiate a file transfer; text through socket, binary via rshell. rshell server address communicated via socket.
    // ghsocket.COD   = "O" // as above but sender requests payment which is paid on delivery
    // ghsocket.MERCH = "M" // 1337merchant socket; indicates an active player run store that can transfer it's webpage via socket, initiate file transfer, or provide services such as databasing, bbs, etc
    //
    // far future possibilities
    // encryption for payloads
    // salted fake encrypted payloads sent along real payloads, at random; wait until when we can queue multiple packet transmissions at once before tackling this
    // flags for swapping keys or whatever. not sure how to do this over socket while being able to assure people that /I/ cannot decrypt their stuff despite having access to the packets
    // local keys, user owned private keys, etc will need to be researched
    //
    // MARKER
    ghsocket.EOP = char(172) // end of packet: ¬
    //

    // --- helpers ---

    ghsocket.pad = function(s, len)
        while s.len < len
            s = s + " "
        end while
        return s
    end function

     ghsocket.get_nickname = function(sub)
        //if not sub isa "subwallet" then return null
        raw = sub.get_info.split(char(10))
        nickname = raw[6].split(":")[1].trim
        if nickname.len < 2 then 
            ghsocket.nicknames.shuffle
            nickname = ghsocket.nicknames[0].indexes[0]
        end if
        nickname = ghsocket.pad(nickname,ghsocket.NICKNAME_SIZE)
        print "debug: assigning: "+nickname
        return nickname
    end function

    ghsocket.rand_sid = function()
        chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        sid = ""
        for i in range(0, 7)
            sid = sid + chars[floor(rnd*(chars.len))]
        end for
        return sid
    end function

    ghsocket.get_pub = function(sub)
        info = sub.get_info.split(char(10))
        public_id = info[0].split(":")[1]
        return public_id
    end function

    ghsocket.up_seq = function(seq)
        n = seq.to_int
        n = (n + 1) % 100
        if n < 10 then
            return "0"+str(n)
        end if
        return str(n)
    end function

    ghsocket.sanitize = function(s)
        if not get_shell.host_computer.is_network_active() then exit "Error: network disconnected!"
        //approved = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!?@#$%^&*_-=+?/,:'"". " // i will use a set disallow list instead
        //restricted = ("><\|`~}{]""[)("+char(9)+char(10)+char(11)+char(13)+char(172)+char(3)).values
        restricted = [")",">","<","\","|","`","~","}","{","]","""","[",")","("]
        for i in range(1,31)
            restricted.push(char(i))
        end for
        for c in @s 
            if restricted.indexOf(c) != null or c == char(0) then 
                if @s == "/term" or @s == "/reset" or @s == "/exit" then return s
                print colorRed+"Invalid input detected. tsk tsk tsk"+char(10)+"-- timeout: 5s"+char(10)+
                "Restricted: "+"<b>><\|`~}{]""[)(</b> and all in range( <b>char(0) through char(31)</b> )"
                wait(5)
                return 0
            end if
        end for
        return s
    end function 

    ghsocket.mk_packet = function(last_info, flag, sid, seq, ack, payload, authid, nickname, stamp=0)    
        
        payload = payload[0:ghsocket.PAYLOAD_SIZE]
        payload = ghsocket.pad(payload, ghsocket.PAYLOAD_SIZE)

        next_info = last_info.split(char(10))
        // last_pkt = last_info[5][3:]
        
        pkt = ghsocket.SIG                // 2 chars; GH
        pkt = pkt + ghsocket.VER          // 1 char; major version number
        pkt = pkt + flag                  // 1 char; transport/session flag
        pkt = pkt + ghsocket.pad(sid, 8)  // 8 chars; socket id
        pkt = pkt + seq                   // 2 chars; seq
        pkt = pkt + ack                   // 2 chars; ack
        pkt = pkt + payload.len           // 2 chars; 64
        pkt = pkt + payload               // 64 chars; data to transmit
        // future payload encryption step probably goes here
            // more efficient to encrypt just the payload than the whole packet. we don't want to waste time decrypting packets we will then drop.
        pkt = pkt + authid                // 32 chars // recipient, there can be -no- mistake about intended recipient so we don't use nicknames, we use the full public id.
        pkt = "r1:"+pkt                   // 3 chars // packet header // packet size == 113 chars

        // metadata below, not used in packet processing, only for testing and debugging
            // remember to remove this and add it's space to payload data max length
        pkt = pkt + ghsocket.MINV         // one byte; minor version // debug only
        pkt = pkt + ghsocket.PATCH        // one byte; patch version // debug only
        pkt = pkt + [current_date,stamp][stamp != 0]   // 19 chars; date and time of transmission // i'll keep the time stamp since it's still useful outside of testing purposes
        pkt = pkt + nickname // debug only   // 4 chars; socket state
        
        pkt = ghsocket.pad(pkt, ghsocket.PACKET_SIZE-1)
        pkt = pkt + ghsocket.EOP          // 1 char; end of packet; char(172); total packet size == 156 chars
        //
        next_info[5] = pkt 
        pkt = next_info.join(char(10))    // wrap packet with full subwallet info
        if pkt.len > ghsocket.MAX_INFO then pkt = last_info
        // transmit
        return pkt
    end function

    ghsocket.parse = function(pkt)
        // debug
        //print colorWhite+"Parsing Info: "+char(10)+pkt+char(10)+colorWhite+"[EOP]"
        if pkt == null then return null
        if pkt.len < 20 then return null

        last_info = pkt.split(char(10))
        pkt = last_info[5][3:]
        // debug
        //print colorWhite+"Parsing Packet: "+char(10)+pkt
        if pkt[0:2] != ghsocket.SIG then return null

        p = {}
        p.flag  = pkt[3]         // flag
        p.sid   = pkt[4:12]      // socket id
        p.seq   = pkt[12:14]     // seq
        p.ack   = pkt[14:16]     // ack
        p.data  = pkt[18:82]     // payload data // remember to increase this when removing metadata from packet
        p.ppub  = pkt[82:114]    // peer public id
        // v metadata // only used for debugging and testing, remove before release
        p.minv  = pkt[114:115]   // minor version
        p.ptch  = pkt[115:116]   // patch version
        // ^ metadata // remove before release
        p.tmst  = pkt[116:135]   // packet timestamp
        p.nickname = pkt[135:149] // nickname associated with sender 
        // nicknames are assigned randomly on chat creation
        // chat's will display the nickname in the packet they receive
        // nicknames are cosmetic only and not used for chat authority
            // sid and public id are the packet-ownership
        p.eop  = pkt[149:pkt.indexOf(ghsocket.EOP)] // should be empty at this point
        return p
    end function

    //////////////////////// --- SOCKET OBJECT --- ////////////////

    ghsocket.open = function(userSub, peerSub, mode)
        
        sock = {}
        sock.classID = "socket" // please note: socket and session are used interchangeably. Consider both to be referring to a "socket session".
        
        // session socket states; 
            // used internally
            // not for transmission logic
            // included in packet for debug purposes -only-
        // INIT, IDLE, JOIN, ACPT, DENY, ACTV, CLSD
        sock.INIT      = "INIT"
        sock.IDLE      = "IDLE"
        sock.JOINING   = "JOIN"
        sock.JOINED    = "JOND"
        sock.ACCEPTING = "ACPT"
        sock.DENYING   = "DENY"
        sock.ACTIVE    = "ACTV"
        sock.CLOSED    = "CLSD"
        // do not confuse or conflate flags with states!
        // wave your flags abroad; ghsocket flags go in packets
        // keep your states at home; socket states are used in the running script

        //
        // sock.user = coin.get_subwallet(userSub)
        sock.user = userSub
        if not sock.user then 
            print "error: user unkown"
            wait 1.731
            return null
        end if
        sock.upub = ghsocket.get_pub(sock.user)
        sock.u_nickname = [ghsocket.get_nickname(sock.user),"Minu"][mode == "LISTENER"] // add function to assign based on sw info
        // //
        //
        //
        sock.peer = peerSub
        if not sock.peer then 
            print "error: peer unkown"
            wait 1.731
            return null
        end if
        sock.ppub = ghsocket.get_pub(sock.peer)
        sock.p_nickname = "Minu" 
    

        // 
        print (colorWhite+"Initialized Clients: "+char(10)+"user: - "+sock.upub+" ["+sock.u_nickname+"]"+char(10)+"peer: - "+sock.ppub+" ["+sock.p_nickname+"]"+char(10)+"<b>< - >")

        sock.seq        = "00"
        sock.ack        = "00"
        sock.connected  = 0

        sock.state        = sock.INIT // metadata for socket state, also sent with packets after the timestamp for -debugging_only-; INIT, IDLE, JOIN, LSTN, ACPT, DENY, ACTV, CLSD 
        sock.mode         = mode     // HOST | JOINER | LISTENER ; host owns the sid, joiner joins with a sid, listener attaches to an already open host/joiner session
        sock.is_host      = (mode == "HOST" or mode == "SERVER")
        sock.is_join      = (mode == "JOINER" or mode == "PING")
        sock.is_read      = (mode == "LISTENER")
        sock.can_ack      = (mode == "LISTENER") // only the listener may ACK packets!!!
        sock.is_server    = (mode == "SERVER")
        sock.syn = null
        sock.sid          = ["",ghsocket.rand_sid][sock.is_host] // sessions are bound to socket id, host owns sid, listener requests a specific socket
        // sock.sid          = [sock.sid,"00000000"][sock.is_server or sock.is_pinging]
        sock.s_start      = 0 // set to time when SYN starts, reset each TIMEOUT until MAX_SYN_TIMEOUTS
        sock.s_timeouts   = 0 // incriment by one at each timeout and resend SYN request
        sock.transport_up = false // if true; SYN handshake complete
        sock.authorized   = false   // if true; JOIN has been accepted by host
        sock.peer_listener_attached = false
        sock.sent         = ["","","","",""]
        sock.received     = ["","","","",""]
        sock.dropped      = []
        //
        // sock.in_transit   = {
        //     "pkt":null,
        //     "seq":null,
        //     "waiting_for_ack":false,
        //     "sent_at":0,
        //     "timeouts":0,
        // }
                
        // --- methods ---
        sock.in_transit = {
            "pkt":null,
            "seq":null,
            "waiting_for_ack":false,
            "sent_at":0,
            "timeouts":0,
            }
        sock.in_transit.reset = function()
            sock.in_transit.pkt = null
            sock.in_transit.seq = null
            sock.in_transit.waiting_for_ack = false
            sock.in_transit.sent_at = 0
            sock.in_transit.timeouts = 0
            return null
        end function

        sock.tick = function()
            sock.recv
            if sock.in_transit.waiting_for_ack then
                // check timeout
                if time - sock.in_transit.sent_at >= ghsocket.TIMEOUT then
                    if sock.in_transit.timeouts >= ghsocket.MAX_TRANSMISSION_TIMEOUTS then
                        // drop packet with notification
                        print colorError+"<size=75%>\\ Timeout: max timeouts reached: dropping packet"
                        sock.dropped.push(ghsocket.parse(sock.in_transit.pkt)) // store only the dropped packet, not the unrelated subwallet info
                        sock.in_transit.waiting_for_ack = false
                        sock.in_transit.reset
                    else
                        print colorOrange+"<size=75%>\\ Timeout [ "+ sock.in_transit.timeouts +" of "+ ghsocket.MAX_TRANSMISSION_TIMEOUTS +" ]: retransmitting packet..."
                        sock.re_send(sock.in_transit.pkt)
                        sock.in_transit.sent_at = time
                        sock.in_transit.timeouts = sock.in_transit.timeouts + 1
                    end if
                end if
            end if
            return null
        end function
        
        sock.join_request = function()
            if sock.state != sock.IDLE then return null
            if sock.seq != "00" or sock.ack != "00" then return null
            sock.state = sock.JOINING
            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.JOIN, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug
            print colorOrange+"</b>Requesting permission to join session: "+colorWhite+sock.sid
            sock.user.set_info(pkt)
            // for later use in retransmitting dropped packets
            sock.sent.push(pkt)
            sock.sent.pull
            wait 1.137
        end function

        sock.attach_listener = function(sid)
            if not sock.is_read then return null
            sock.sid = sid
            raw = sock.peer.get_info
            p = ghsocket.parse(raw)
            if p.sid != sid or p.ppub != sock.upub then return null
            if p.flag == ghsocket.TRM or p.flag == ghsocket.RST then return null
            sock.state = sock.ACTIVE
            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.LST, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname)
            print colorGreen+"Attaching listener to session: "+colorGold+sid // if sid and ppub match, listening is authorized. this can be useful for reading offline messages, maybe.
            // debug
            print colorWhite+"Broadcasting to peer: "+colorGreen+"Listening to socket: "+CT+sock.sid
            sock.u_nickname = sock.listener_nickname
            sock.p_nickname = p.nickname
            sock.user.set_info(pkt)
            sock.sent.push(pkt)
            sock.sent.pull
            wait 1.137
            return true
        end function
        //
        sock.re_send = function(raw,syn=0) // resend identical packets with updated subwallet info, not stale subwallet info, we don't want to corrupt non-packet subwallet data
            p = ghsocket.parse(raw)
            if not p then return null
            if syn then p.tmst = 0 // if we are in SYN mode we want to update our timestamp on retries. but, -only- in SYN mode.
            pkt = ghsocket.mk_packet(sock.user.get_info, p.flag, p.sid, p.seq, p.ack, "", p.ppub, p.nickname, p.tmst) // palate cleanser
            if not pkt then sock.reset
            sock.user.set_info(pkt)
            wait .317
            pkt = ghsocket.mk_packet(sock.user.get_info, p.flag, p.sid, p.seq, p.ack, p.data, p.ppub, p.nickname, p.tmst)
            if not pkt then sock.reset
            sock.user.set_info(pkt)
            return null
        end function

        sock.send = function(data)
            // term

            if not ghsocket.sanitize(data) then return null
            if data == "/term" or data == "/exit" then return sock.close 
            if data == "/reset" then return sock.reset
            if data.trim == "" then return null
            if sock.state != sock.ACTIVE then 
                print colorRed+"Chat is not yet active"
                return null 
            end if
            if sock.is_read then return null // readers may not transmit

            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.ACK, sock.sid, sock.seq, sock.ack, data, sock.ppub, sock.u_nickname) // sock state is debug
            if not pkt then sock.reset
            
            // debug
           // print char(10)+colorWhite+"<b>Sending Packet: "+char(10)+pkt+char(10)+"--SEQ: "+sock.seq+" ACK: "+sock.ack

            // Transmit
            sock.user.set_info(pkt)

            // store for later use in retransmitting dropped packets
            sock.sent.push(pkt)
            sock.sent.pull
                // the below should supercede the above, once finished
            sock.in_transit.pkt = pkt
            sock.in_transit.seq = sock.seq
            sock.in_transit.waiting_for_ack = true
            sock.in_transit.sent_at = time
            sock.in_transit.timeouts = 0
            //
            // update sock.seq after we transmit
            sock.seq = ghsocket.up_seq(sock.seq) 
            return null
        end function
        // send without payload, only for sending pure acks
        sock.send_ack = function()
            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.ACK, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug
            // debug
            //print "<color=yellow>Sending ACK:"+char(10)+pkt
            if not sock.is_read then return null // only listener may ACK
            sock.user.set_info(pkt)
            // for later use in retransmitting dropped packets
            sock.sent.push(pkt)
            sock.sent.pull
        end function

        // this function dutifully tries it's best not to let anything reach the end. anything that makes it through the gauntlet probably deserves to be ACKnowledged.
        sock.recv = function()
            raw = sock.peer.get_info
            p = ghsocket.parse(raw)
            // drop unownked or corrupt packets
            if not p then return null
            if p.ppub != sock.upub or p.sid != sock.sid then return null 

            // trim data
            p.data = p.data.trim

            // no repeats, no acking an ack
            if p == sock.received[-1] then return null
            // later we will use this for retransmitting dropped packets
            sock.received.push(p)
            sock.received.pull

            // debug
            //print char(10)+colorWhite+"<b>Socket Received Packet: "+char(10)+p+char(10)

            if p.flag == ghsocket.TRM then sock.close
            if p.flag == ghsocket.RST then sock.reset // currently behavior is identical to close
            if p.flag == ghsocket.JOIN and sock.state == sock.IDLE and sock.is_host then
                print colorGold+"</b>Join request from: "+colorWhite+p.ppub+char(10)+colorGold+"-- on socket: "+colorWhite+sock.sid

                // authorization hooks
                sock.authorized = true // later

                if sock.authorized then
                    response_flag = ghsocket.ACCEPT
                    sock.state = sock.ACCEPTING  
                    sock.authorized = true
                    print colorGreen+"Join authorized; waiting on listeners to connect"
                else
                    response_flag = ghsocket.DENY
                    print colorRed+"Join denied"
                end if

                // allow/disallow
                resp = ghsocket.mk_packet(sock.user.get_info, response_flag, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug

                // debug
                //print colorGold+"Sending join response: "+char(10)+resp

                sock.user.set_info(resp)
                sock.sent.push(resp)
                sock.sent.pull
                return null
            end if

            if p.flag == ghsocket.ACCEPT and sock.state == sock.JOINING then
                sock.state = sock.JOINED
                sock.authorized = true
                print colorGreen+"Joined session "+sock.sid
                return null
            end if

            if p.flag == ghsocket.DENY and sock.state == sock.JOINING then
                print colorRed+"Join denied by host"
                sock.state = sock.IDLE
                return null
            end if

            if p.flag == ghsocket.LST and sock.authorized then
                print colorGreen+"Listener attached to session "+sock.sid
                sock.peer_listener_attached = true   // NOW the chat is live
                sock.check_active
                return null // we no longer ACK listen requests
            end if

            // chat disallowed unless active
            if sock.state != sock.ACTIVE then return null

            // Update ack only when we read data and only set it to the last read p.seq!!!
            if p.flag == ghsocket.ACK and p.ppub == sock.upub and sock.in_transit.waiting_for_ack and p.data == "" then // only listener may ack; reader clients use this to confirm their own transmissions and retransmit as needed
                //print colorCyan+"debug: rcv ACK: "+"-- p.ack: "+p.ack+"  -waiting for: "+sock.in_transit.seq
                if p.ack != sock.in_transit.seq then      
                    print char(10)+colorRed+"SEQ/ACK DESYNC DETECTED"+char(10)+
                    colorDefault+"-- p.ack: "+colorOrange+p.ack+CT+"  --  sock.in_transit.seq: "+colorOrange+sock.in_transit.seq
                else 
                    sock.in_transit.waiting_for_ack = false
                    sock.in_transit.reset
                end if
            end if 
    
            // don't ACK ACKS or other empty payloads
            if p.data == "" then return null
            
            /////////////////////////////////////////
            // send ack -only for received data-
            sock.ack = p.seq
            sock.p_nickname = p.nickname
            if sock.is_read then sock.send_ack // only listener may ack
            
            ///////////////////////////////////////
            //print "debug: returning: <b>"+p.data
            return p.data
        end function // end sock.recv

        sock.listener_nickname = function()
            if sock.state != sock.ACTIVE then return null
            raw = sock.user.get_info
            s = ghsocket.parse(raw)
            n = s.nickname
            return n
        end function
            
        sock.echo_self = function()
            if sock.state != sock.ACTIVE then return null
            raw = sock.user.get_info
            s = ghsocket.parse(raw)
            // debug
            // drop unownked or corrupt packets
            if not s then return null
            if s.sid != sock.sid then return null // only echo this session's packets
            // trim data
            s.data = s.data.trim
            if s.data == "" then return null //else print "data: "+s.data
            // no repeats, no acking an ack
            if s == sock.sent[-1] then return null else sock.sent.push(s)
            //print "echo rcvd: "+s
            // we do not ack our own packets
            sock.seq = s.seq
            sock.u_nickname = s.nickname
            return s.data 
        end function

        sock.close = function()
            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.TRM, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug
            print colorOrange+"Closing socket"
            sock.state = sock.CLOSED
            sock.user.set_info(pkt)
            sock.connected = 0
            sock.in_transit.reset
            // exit ghsocket.TRM
            return null
        end function

        sock.reset = function()
            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.RST, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug
            if not pkt then exit colorError+"Socket closed unexpectedly" else print colorOrange+"Socket resetting"
            sock.state = sock.CLOSED
            sock.user.set_info(pkt)
            sock.connected = 0
            sock.in_transit.reset
            // exit ghsocket.RST
            return null
        end function

        sock.check_active = function()
            if sock.authorized then sock.state = sock.ACTIVE else return null
            print colorGreen+"Session "+colorWhite+sock.sid+CT+" ACTIVE"
        end function



        ////////////// -- end methods -- ///////////////

        if sock.mode == "RESET" then return sock.reset
        //
        //
        // READY TO SYN
        if sock.is_host or sock.is_join then
            // send SYN
            pkt = ghsocket.mk_packet(sock.user.get_info, ghsocket.SYN, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug
            // debug
            colorWhite+"Preparing Packet: "+char(10)+pkt+char(10)+"<b>< - >"
            sock.user.set_info(pkt) // fire SYN request
            sock.sent.push(pkt)
            sock.sent.pull
            wait 1.137
            sock.s_start = time
            sock.s_timeouts = 0
            sock.syn = pkt
        else
            // LISTENER doesn't SYN, return a connected but passive object instead
            sock.transport_up = true
            sock.connected = 1
            wait 1.137
            return sock
        end if
        
        print colorWhite+"Sending SYN request"+char(10)+colorWhite+"-- waiting for response..."+char(10)
        ////////////////////////////////////////////////////////////////// HANDSHAKE ////////////////////////////////////////////////////////
        while not sock.transport_up
            // did we time out?
            if time - sock.s_start >= ghsocket.TIMEOUT*2 then 
                sock.s_start = time
                sock.s_timeouts = sock.s_timeouts + 1
                if sock.s_timeouts >= ghsocket.MAX_SYN_TIMEOUTS and not sock.is_server then 
                    print colorError+"\\ Socket timed out; aborting..."
                    return sock.reset
                end if
                if not sock.is_server then
                    print colorWarning+"<size=75%>\\ Timeout ["+sock.s_timeouts+" of "+ghsocket.MAX_SYN_TIMEOUTS+"]: retrying SYN..."
                    sock.re_send(sock.sent[-1],1)
                else
                    //print colorOrange+"Server: resending: "+char(10)+sock.syn
                    sock.re_send(sock.syn,1)
                end if
            end if

            raw = sock.peer.get_info
            p = ghsocket.parse(raw)

            if not p or p == sock.received[-1] or p.ppub != sock.upub then
                wait .137
                continue 
            end if
            // debug
            //print "--rcvd: "+colorGold+p
            sock.received.push(p)
            sock.received.pull
            ////////////////////////////////// BEGIN SYN //////////////////
            if p.flag == ghsocket.SYN then
                sock.seq = "00"
                print colorWhite+"Received SYN request: "+p.flag+" "+p.sid+" "+p.seq+p.ack+char(10)+"From peer: "+p.ppub+char(10)
                if not sock.is_host then
                    sock.sid = p.sid
                    print colorDefault+"We are client, updating SID to "+colorWhite+sock.sid
                else
                    print colorDefault+"We are host, preserving SID "+colorWhite+sock.sid
                    if sock.sid != p.sid then 
                        wait .137
                        continue
                    end if
                end if

                sock.ack = p.seq

                action = [ghsocket.ACK, ghsocket.SYN][sock.is_join] // original SYNer ACKs the joiner's SYN, joiner SYNs with the og SYNer

                resp = null
                resp = ghsocket.mk_packet(sock.user.get_info, action, sock.sid, sock.seq, sock.ack, "", sock.ppub, sock.u_nickname) // sock state is debug
                // debug
                print colorWhite+"Sending response... "+char(10)
                sock.user.set_info(resp)
                sock.sent.push(resp)
                sock.sent.pull
                wait 1.137
            else if (p.flag == ghsocket.ACK or p.flag == ghsocket.JOIN) and p.sid == sock.sid and not sock.transport_up and not sock.is_server then
                sock.state = sock.IDLE // connected but not chatting, yet
                sock.transport_up = true
                sock.connected = 1
                sock.p_nickname = p.nickname
                //wait 1.137
                // debug
                print colorWhite+"Transport established: ["+sock.sid+"]"
            else if (p.flag == ghsocket.RST or p.flag == ghsocket.TRM) and p.sid == sock.sid then // we dont want to term new listener syncs so this won't trigger in most cases for right now
                print colorRed+"Socket reset by peer"
                if p.flag == ghsocket.TRM then return sock.close else return sock.reset
            // else if p.flag == ghsocket.PING and sock.is_server then
            //     print colorOrange+"Received ping from: "+sock.ppub+char(10)+colorOrange+"-- sending response..." // server mode loops through every subwallet, updating ppub and probing it, until terminated
            //     sock.re_send(syn,1) // simply update timestamp to show activity
            //     wait .137
            end if

            wait .137
            
        end while

        return sock
    end function

    //return ghsocket

// Usage: 
// session = ghsocket.open(c,u,p) // c: coin; object, u: user subwallet name; String, p: peer subwallet name; String
//
// session.send(msg)
// session.recv
// session.close
// session.reset
///



///// TESTING PORTION BELOW //////
bye = function()
	exit "goodbye"
end function


print_banner = function() // todo
    print("<color=yellow>1337"+colorWhite+"comm5"+CT+" V "+ghsocket.VER+"."+ghsocket.MINV+"."+ghsocket.PATCH+", by "+CT+colorGrey+"Plu70",1)
end function


///// sample subwallet info structure ////
// pu:public address
// jd:join date
// id:private wallet id
// m7:1337insurance
// r0:reserved
// r1:1337comm5 packets 
// r2:reserved
//
//
// pu:1f01f03dd605ec36da2271eaf69e4325
// jd:1/1/2000
// id:8008008008008
// m7:123456
// r0:0
// r1:GH1A3FGQAVPP030364hello world                                                     476fc066d1456789e263e3488ffd8c5315/Mar/2004 - 21:02                   ¬
// r2:0
