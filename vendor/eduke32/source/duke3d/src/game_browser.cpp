#include "game_browser.h"

#include "duke3d.h"

#ifdef __EMSCRIPTEN__
# include <emscripten/emscripten.h>
#endif

#ifdef __EMSCRIPTEN__
void G_BrowserPublishGameState(DukePlayer_t const *pPlayer)
{
    auto const &submittedInput = inputfifo[0][myconnectindex];
    int const currentWeapon = pPlayer->curr_weapon >= 0 ? pPlayer->curr_weapon : 0;
    int const currentAmmo =
        (unsigned) currentWeapon < MAX_WEAPONS ? pPlayer->ammo_amount[currentWeapon] : 0;

    EM_ASM({
        const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
        const state = host.state || (host.state = globalThis.__edukeState || {});

        state.frameCounter = $0;
        state.totalclock = $1;
        state.ototalclock = $2;
        state.moveThingsCount = $3;
        state.ready2send = $4;
        state.gm = $5;
        state.cursectnum = $6;
        state.x = $7;
        state.y = $8;
        state.z = $9;

        globalThis.__edukeState = state;
    },
    (int) g_frameCounter,
    (int) totalclock,
    (int) ototalclock,
    (int) g_moveThingsCount,
    (int) ready2send,
    (int) pPlayer->gm,
    (int) pPlayer->cursectnum,
    pPlayer->pos.x,
    pPlayer->pos.y,
    pPlayer->pos.z);

    EM_ASM({
        const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
        const state = host.state || (host.state = globalThis.__edukeState || {});
        const input = host.input || globalThis.__edukeInput || {};

        state.ang = $0;
        state.horiz = $1;
        state.weapon = $2;
        state.ammo = $3;
        state.kickback = $4;
        state.localBits = $5 >>> 0;
        state.localExtBits = $6 >>> 0;
        state.localFvel = $7;
        state.localSvel = $8;
        state.localAvel = $9;
        state.injectedButtons = input.injectedButtonsObserved | 0;

        globalThis.__edukeState = state;
    },
    fix16_to_int(pPlayer->q16ang),
    fix16_to_int(pPlayer->q16horiz),
    currentWeapon,
    currentAmmo,
    (int) pPlayer->kickback_pic,
    (int) localInput.bits,
    (int) localInput.extbits,
    (int) localInput.fvel,
    (int) localInput.svel,
    (int) localInput.q16avel);

    EM_ASM({
        const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
        const state = host.state || (host.state = globalThis.__edukeState || {});

        state.localHorz = $0;
        state.submittedBits = $1 >>> 0;
        state.submittedExtBits = $2 >>> 0;
        state.submittedFvel = $3;
        state.submittedSvel = $4;
        state.submittedAvel = $5;
        state.submittedHorz = $6;

        globalThis.__edukeState = state;
    },
    (int) localInput.q16horz,
    (int) submittedInput.bits,
    (int) submittedInput.extbits,
    (int) submittedInput.fvel,
    (int) submittedInput.svel,
    (int) submittedInput.q16avel,
    (int) submittedInput.q16horz);
}

void G_BrowserPublishSubmittedInput(input_t const &input)
{
    EM_ASM({
        const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
        const submitted = host.submittedInput || (host.submittedInput = globalThis.__edukeSubmittedInput || {});

        submitted.bits = $0 >>> 0;
        submitted.extbits = $1 >>> 0;
        submitted.fvel = $2;
        submitted.svel = $3;
        submitted.avel = $4;
        submitted.horz = $5;

        globalThis.__edukeSubmittedInput = submitted;
    }, (int) input.bits, (int) input.extbits, (int) input.fvel, (int) input.svel, (int) input.q16avel, (int) input.q16horz);
}

void G_BrowserPublishDrawProgress(int phase, int32_t playerNum)
{
    DukePlayer_t const *pPlayer = g_player[playerNum].ps;

    EM_ASM({
        const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
        const progress = host.drawProgress || (host.drawProgress = globalThis.__edukeDrawProgress || {});

        progress.phase = $0;
        progress.playerNum = $1;
        progress.sect = $2;
        progress.x = $3;
        progress.y = $4;
        progress.z = $5;

        globalThis.__edukeDrawProgress = progress;
    }, phase, playerNum, (int) pPlayer->cursectnum, pPlayer->pos.x, pPlayer->pos.y, pPlayer->pos.z);
}

void G_BrowserPublishLoopState(int stage, int fpsReady, int gameUpdate)
{
    EM_ASM({
        const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
        const loop = host.loopState || (host.loopState = {});

        loop.stage = $0;
        loop.fpsReady = $1;
        loop.gameUpdate = $2;
        loop.totalclock = $3;
        loop.ototalclock = $4;
        loop.frameCounter = $5;
        loop.moveThingsCount = $6;
        loop.frameJustDrawn = $7;
        loop.ready2send = $8;
        loop.time = performance.now();

        globalThis.__edukeLoopState = loop;
    },
    stage,
    fpsReady,
    gameUpdate,
    (int) totalclock,
    (int) ototalclock,
    (int) g_frameCounter,
    (int) g_moveThingsCount,
    (int) g_frameJustDrawn,
    (int) ready2send);
}
#else
void G_BrowserPublishGameState(DukePlayer_t const *pPlayer)
{
    UNREFERENCED_PARAMETER(pPlayer);
}

void G_BrowserPublishSubmittedInput(input_t const &input)
{
    UNREFERENCED_PARAMETER(input);
}

void G_BrowserPublishDrawProgress(int phase, int32_t playerNum)
{
    UNREFERENCED_PARAMETER(phase);
    UNREFERENCED_PARAMETER(playerNum);
}

void G_BrowserPublishLoopState(int stage, int fpsReady, int gameUpdate)
{
    UNREFERENCED_PARAMETER(stage);
    UNREFERENCED_PARAMETER(fpsReady);
    UNREFERENCED_PARAMETER(gameUpdate);
}
#endif
