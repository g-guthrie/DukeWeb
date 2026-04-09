#pragma once

#ifndef duke3d_game_browser_h_
#define duke3d_game_browser_h_

#include "player.h"

void G_BrowserPublishGameState(DukePlayer_t const *pPlayer);
void G_BrowserPublishSubmittedInput(input_t const &input);
void G_BrowserPublishDrawProgress(int phase, int32_t playerNum);
void G_BrowserPublishLoopState(int stage, int fpsReady, int gameUpdate);

#endif
