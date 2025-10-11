# RPGMaker_AICharacter
A plugin for RPGMaker MZ for characters controlled by LLMs

## Purpose
NPCs for the RPGs you define wiht RPGMaker are clumsy to write and hard to write in a way that feels like an actual "non player character" (this holds true for most RPGs, actually).

This plugin allows you to connect an LLM from Mistral or from OpenAI to an RPGMaker event, turning it into a character you can talk to, and to have much more lively interactions with. It's a bit experimental. It works, is fairly bug-free, but I have no clue if it is realiable enough for a real productiv RPG.

Try it out and decide for yourself.

## Features
Use the plugin in an RPGMaker MZ event to

- have an NPC react to chats, or starts discussions with the player (or other NPCs :) ) on their own.
- three options for the player to chat: enter a chat message via menu, with a "chat" button or as a reply to a chat from the NPC.
- Every NPC can have their own personality and background story that will affect their behavior.
- Let an NPC roam on its own, minding its own business and interacting with the player and environment as it wishes.
- Let an NPC pursue a goal, and react on whether it (believes it) has reached the goal, decided it failed, or wants to continue.
- Let an NPC give the player an item (if the LLM decides it wants to).
- NPCs that want to go to a certain coordinate automatically do thiw by finding the shortest path there.
- Decide what LLM you want to use, how dialogs should look like and how they should be positioned.

## Commands
- TBD

## Usage
Put the two plugins AICharacter and ChatMenu into the js/plugins folder of your game. Then go to the plugin manager to define the following plugin parameters:



