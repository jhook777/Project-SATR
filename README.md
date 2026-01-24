# ghsocket.so
A TCP-like socket system for grey hack's crypto coin subwallet system
<br>
For use in the game Grey Hack, by Loading Home Studios.

Build 
<code>
nicknames.gs.src to /root/src/nicknames.gs
and
ghsocket.gs.src to ghsocket.gs

include_lib(path_to_ghsocket.gs)

The end user plugs the API into a UI of their own making.
(sorry the 1337comm5 one is proprietary)

Subwallet info structure only requires lines 0, 5, and 6
Adjust values in ghsocket.parse if your subwallet info structure is different.

<pre>
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

    
// Usage: 
// session = ghsocket.open(c,u,p) // c: coin; object, u: user subwallet name; String, p: peer subwallet name; String
//
// session.send(msg)
// session.recv
// session.close
// session.reset
///
</pre>
