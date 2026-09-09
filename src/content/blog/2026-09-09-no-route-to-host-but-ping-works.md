---
title: "When macOS Says \"No Route to Host\" But Ping Works"
date: 2026-09-09
description: "SSH to every host on my LAN failed with No route to host, while ping to those same hosts came back 0% loss. The internet worked fine. The cause was brew upgrade --cask replacing iTerm2's application bundle while I was typing in it, which cost the running process its macOS Local Network permission. macOS reports that denial as EHOSTUNREACH, so the error names the wrong subsystem. The fix is to quit and relaunch. Toggling the permission does nothing."
tags: ["tech", "macos", "networking", "ssh", "tcc", "homebrew"]
---

On September 4th, Chrome stopped loading pages. I quit it, reopened it, everything worked, and I filed a bug against my dotfiles saying "Homebrew's Chrome cask update breaks running Chrome." Then I closed the issue tab and moved on with my life, having learned one fact about Chrome from a problem that was not about Chrome.

Five days later I could not `ssh` to anything on my own network.

## The symptom, and the fix

If you found this from a search: on macOS, TCP connections to hosts on your local network fail with `No route to host` while `ping` to those same hosts succeeds with 0% packet loss, and the internet works normally. Connections to `localhost` are fine. The same command run from Terminal.app, or from a different terminal emulator, works.

The cause is that something replaced your terminal application's bundle on disk while it was running — almost certainly `brew upgrade --cask` in a batch upgrade you ran an hour ago and forgot about. The running process lost its macOS Local Network permission and has no way to ask for it back.

Quit the application and relaunch it. That's the whole fix.

Do not toggle the Local Network permission in System Settings. It will not help, for reasons below, and it destroys the evidence you would need to tell this apart from a grant that really was revoked the next time it happens.

## Why this takes an hour to find

The error is a lie. Not maliciously, but macOS synthesizes `EHOSTUNREACH`, which the shell prints as `No route to host`, when it denies an application Local Network access. That error belongs to a routing failure. So every instinct you have points at the network layer, and every one of those instincts is wrong.

Here is what I checked on ASIAGO, in order, over an embarrassing stretch of a Tuesday morning:

`ssh` to a LAN host: `No route to host`. Fine. Something's wrong with the network.

`ping` to that same host: succeeds. 0% packet loss. ARP entry resolved.

That should have stopped me right there, and it took me three more steps to understand why. A real `EHOSTUNREACH` requires ARP to fail. The kernel returns "no route to host" when it cannot find a next hop, and it cannot find a next hop when nothing answers the ARP request. My machine had the target's MAC address sitting in its ARP table. It knew exactly where the host was. ICMP packets were making the round trip. The route was not the problem, and had not been the problem for the last twenty minutes of my life.

`nc` to port 445 on the same host: fails identically. So this is not an SSH problem, not a key problem, not a `known_hosts` problem, not the four other SSH-flavored things I was mentally lining up to check next.

`ssh localhost`: works. Loopback never touches the local network, so it never gets gated.

The same `ssh` command from Terminal.app: works. Same key, same config, same host, same second. Different application.

A freshly launched iTerm2: works.

The thing that kept me pointed in the wrong direction the longest was Finder. Its SMB mounts kept working the entire time, which is a fairly convincing argument that your network is fine and your SSH setup is broken. Apple's own applications are exempt from Local Network gating, so Finder was never subject to the thing that was happening. It sat there reading files off the same host I could not open a socket to.

## What's actually going on

macOS asks for Local Network permission per application, and once you grant it, macOS records the permission in the TCC database against that application's identity.

The grant was never revoked. Privacy & Security → Local Network showed iTerm2 enabled, checkbox on, the whole time I could not reach a single machine in my house. Toggling it off and back on changed nothing for the running session, because a running process does not re-read the TCC database. Only a newly launched process picks up current state, which is also why relaunching fixes it and nothing else does.

My working model, which is inference from reproducible behavior rather than something I can prove from Apple's source: macOS evaluates Local Network authorization once per running process and caches it against that process somewhere in the networking stack. Replacing the bundle underneath a running process invalidates that cached binding. The process is left holding a reference to an authorization that no longer resolves, and it has no path to re-request one, because re-requesting happens at launch.

What I can state as fact: the TCC grant is intact, the toggle has no effect on the running process, the same binary launched fresh works immediately, and this reproduces on both Chrome and iTerm2 under `brew upgrade --cask`. That's macOS 26.6.2, build 25G83.

This is a different failure from the more familiar Homebrew permission problem, where a managed binary moves to a new path and TCC orphans the grant because the path no longer matches. Here the bundle identity is unchanged, the code signature is unchanged, and the grant is intact. What broke is the binding between the grant and the process that was already running when the bundle was swapped.

## Back to Chrome

September 4th, then. Chrome had lost network access after a cask upgrade, quitting and reopening had fixed it, and I wrote that down as a fact about Chrome. Chrome has a self-updater, I reasoned, so the obvious answer is to exclude it from my bulk upgrade and let it handle itself.

That is a correct fix for Chrome and a completely useless fix for the actual problem, which is that `brew upgrade --cask` replaces application bundles in place, and any running application that touches the network is a candidate. Chrome's version was loud and generic — pages don't load — so it read as a browser problem. iTerm2's version was quiet and specific enough to send me looking at my router.

Two confirmed cases in five days is a property of in-place bundle replacement. The only reason I know about exactly two applications is that those are the two I happened to be using when the upgrade ran.

## What to do about it

I filed [the general case](https://github.com/twistedmelonman/dotfiles/issues/312) against my dotfiles, with [the Chrome case](https://github.com/twistedmelonman/dotfiles/issues/307) reframed as an instance of it. The options, in order of how much work they are:

Exclude specific casks from bulk upgrades where the application ships its own updater. Chrome does, iTerm2 does, and this is a two-line change that covers both known cases. It also covers nothing else.

Detect running processes for casks about to be upgraded and prompt, rather than blocking the whole run. More work, and it needs a decision about what "prompt" means in a script you run unattended.

Emit a post-upgrade notice listing every upgraded cask that was running at the time. This is the weakest of the three because it prevents nothing at all. It is also the only one that helps with the case I don't know about yet, which is the one that will cost me another Tuesday morning.

I'm doing the first one because it's free. The third one is the one worth building.

The rule I want to remember: on macOS, `EHOSTUNREACH` on a TCP connection to a LAN host, while ICMP to that same host succeeds, is a permission denial wearing a routing error's clothes. Check what replaced your application on disk before you check your routing table.
