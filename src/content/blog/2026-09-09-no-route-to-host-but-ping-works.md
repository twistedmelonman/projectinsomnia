---
title: "When macOS Says \"No Route to Host\" But Ping Works"
date: 2026-09-09
description: "SSH to every host on my LAN failed with No route to host, while ping to those same hosts came back 0% loss and the internet was fine. brew upgrade --cask had replaced iTerm2's bundle while I was typing in it, and the running process lost its macOS Local Network permission. macOS reports that denial as EHOSTUNREACH, which sends you looking at your routing table. Quit and relaunch. Toggling the permission does nothing."
tags: ["tech", "macos", "networking", "ssh", "tcc", "homebrew"]
---

On September 4th Chrome stopped loading pages. I quit it, reopened it, everything worked, and I filed a bug against my dotfiles saying "Homebrew's Chrome cask update breaks running Chrome." Then I closed the tab.

Five days later I couldn't `ssh` to anything on my own network.

## The symptom, and the fix

If you got here from a search: on macOS, TCP to hosts on your local network fails with `No route to host`, `ping` to those same hosts succeeds with 0% loss, and the internet works normally. `localhost` is fine. The same command from Terminal.app works.

Something replaced your terminal's application bundle on disk while it was running. Almost certainly `brew upgrade --cask`, in a batch upgrade you ran an hour ago and forgot about. The running process lost its macOS Local Network permission and can't ask for it back.

Quit the application and relaunch it.

Don't toggle the Local Network permission in System Settings. It won't help, and it destroys the evidence you'd need next time to tell this apart from a grant that really was revoked.

## Why this takes an hour to find

macOS synthesizes `EHOSTUNREACH` when it denies an application Local Network access, and the shell prints that as `No route to host`. It's a routing error. Nothing about it suggests permissions, so you go look at your routing table, which is fine, and then you go look at everything else that's also fine.

Here's what I checked on ASIAGO, in order, over an embarrassing stretch of a Tuesday morning.

`ssh` to a LAN host: `No route to host`.

`ping` to that same host: 0% packet loss, ARP entry resolved.

That should have stopped me. A real `EHOSTUNREACH` requires ARP to fail — the kernel says "no route to host" when it can't find a next hop, and it can't find a next hop when nothing answers the ARP request. My machine had the target's MAC address sitting right there in its ARP table. ICMP was making the round trip. Whatever was wrong, it wasn't the route, and it took me three more steps to accept that.

`nc` to port 445 on the same host: fails the same way. So not SSH, not a key, not `known_hosts`, and not the four other SSH-flavored things I had lined up to check next.

`ssh localhost`: works. Loopback doesn't touch the local network.

The same `ssh` from Terminal.app: works. Same key, same config, same host, same second.

A freshly launched iTerm2: also works.

What kept me pointed the wrong way longest was Finder, which held its SMB mounts the entire time. Apple's own applications are exempt from Local Network gating, so Finder was never subject to any of this, and it sat there reading files off the same host I couldn't open a socket to. Hard to argue your network is broken when the Finder window is right there.

## What's actually going on

macOS asks for Local Network permission per application and records the grant in the TCC database against that application's identity.

The grant was never revoked. Privacy & Security → Local Network showed iTerm2 enabled, checkbox on, the whole time I couldn't reach a single machine in my house. Toggling it off and back on did nothing for the running session, because a running process doesn't re-read TCC. Only a newly launched one picks up current state.

My working model, which is inference from reproducible behavior rather than something I can prove from Apple's source: macOS evaluates Local Network authorization once per running process and caches it against that process somewhere in the networking stack. Replacing the bundle underneath invalidates that cached binding, and the process is left holding a reference to an authorization that no longer resolves. It can't re-request one, because re-requesting happens at launch.

What I can state as fact: the TCC grant is intact, the toggle has no effect on the running process, the same binary launched fresh works immediately, and this reproduces on both Chrome and iTerm2 under `brew upgrade --cask`. macOS 26.6.2, build 25G83.

It's worth separating this from the Homebrew permission problem people usually hit, where a managed binary moves to a new path and TCC orphans the grant because the path no longer matches. Here the bundle identity and code signature are unchanged and the grant is intact. What broke is the binding between that grant and the process that was already running when the bundle got swapped.

## Back to Chrome

So: September 4th. Chrome lost network access after a cask upgrade, quitting and reopening fixed it, and I wrote that down as a fact about Chrome. Chrome ships its own updater, I reasoned, so exclude it from the bulk upgrade and let it handle itself.

Which is a fine fix for Chrome and does nothing about the actual problem, which is that `brew upgrade --cask` replaces bundles in place and any running application that touches the network is a candidate. Chrome's symptom was loud and generic — pages don't load — so it read as a browser problem. iTerm2's was quiet and specific enough to send me looking at my router.

I know about exactly two applications because those are the two I happened to be using when the upgrade ran.

## What to do about it

I filed [the general case](https://github.com/twistedmelonman/dotfiles/issues/312) against my dotfiles, with [the Chrome case](https://github.com/twistedmelonman/dotfiles/issues/307) reframed as an instance of it. The options, in order of how much work they are:

Exclude specific casks from bulk upgrades where the application ships its own updater. Chrome does, iTerm2 does, two-line change, covers both known cases and nothing else.

Detect running processes for casks about to be upgraded and prompt instead of blocking the whole run. More work, and it needs a decision about what "prompt" means in a script you run unattended.

Emit a post-upgrade notice listing every upgraded cask that was running at the time. Prevents nothing, but it's the only one of the three that helps with the case I don't know about yet.

I'm doing the first because it's free. The third is the one worth building.

Anyway: if TCP to a LAN host gives you `EHOSTUNREACH` while ICMP to that same host is fine, go look at what replaced your application on disk.
