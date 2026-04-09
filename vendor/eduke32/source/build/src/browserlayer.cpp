#include "browserlayer.h"

#ifdef __EMSCRIPTEN__
# include <emscripten/emscripten.h>

extern "C" {

EM_JS(int32_t, browserGetInjectedButtonsLow, (), {
    const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
    const input = host.input || (host.input = globalThis.__edukeInput || {});
    const legacy = globalThis.__edukeInjectedButtonsLow | 0;
    const manual = legacy !== 0 ? legacy : (input.injectedButtonsLow | 0);

    input.injectedButtonsLow = manual;
    input.injectedButtonsObserved = manual;

    globalThis.__edukeInput = input;
    globalThis.__edukeInjectedButtonsLow = manual;
    globalThis.__edukeInjectedButtonsObserved = manual;

    return manual;
});

EM_JS(int32_t, browserConsumeInjectedMouseX, (), {
    const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
    const input = host.input || (host.input = globalThis.__edukeInput || {});
    const legacy = globalThis.__edukeInjectedMouseX | 0;
    const value = legacy !== 0 ? legacy : (input.injectedMouseX | 0);

    input.injectedMouseX = 0;

    globalThis.__edukeInput = input;
    globalThis.__edukeInjectedMouseX = 0;

    return value;
});

EM_JS(int32_t, browserConsumeInjectedMouseY, (), {
    const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
    const input = host.input || (host.input = globalThis.__edukeInput || {});
    const legacy = globalThis.__edukeInjectedMouseY | 0;
    const value = legacy !== 0 ? legacy : (input.injectedMouseY | 0);

    input.injectedMouseY = 0;

    globalThis.__edukeInput = input;
    globalThis.__edukeInjectedMouseY = 0;

    return value;
});

EM_JS(void, browserPublishTileLoad, (int32_t tileNum, int32_t size, int32_t phase), {
    const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
    const load = host.tileLoad || (host.tileLoad = globalThis.__edukeTileLoad || {});

    load.tile = tileNum;
    load.size = size;
    load.phase = phase;

    globalThis.__edukeTileLoad = load;
});

EM_JS(void, browserPublishCacheProgress, (int32_t tile, int32_t loaded, int32_t queued, int32_t done), {
    const host = globalThis.__edukeHost || (globalThis.__edukeHost = {});
    const progress = host.cacheProgress || (host.cacheProgress = globalThis.__edukeCacheProgress || {});

    progress.tile = tile;
    progress.loaded = loaded;
    progress.queued = queued;
    progress.done = done;

    globalThis.__edukeCacheProgress = progress;
});

}
#else

extern "C" {

int32_t browserGetInjectedButtonsLow(void)
{
    return 0;
}

int32_t browserConsumeInjectedMouseX(void)
{
    return 0;
}

int32_t browserConsumeInjectedMouseY(void)
{
    return 0;
}

void browserPublishTileLoad(int32_t tileNum, int32_t size, int32_t phase)
{
    UNREFERENCED_PARAMETER(tileNum);
    UNREFERENCED_PARAMETER(size);
    UNREFERENCED_PARAMETER(phase);
}

void browserPublishCacheProgress(int32_t tile, int32_t loaded, int32_t queued, int32_t done)
{
    UNREFERENCED_PARAMETER(tile);
    UNREFERENCED_PARAMETER(loaded);
    UNREFERENCED_PARAMETER(queued);
    UNREFERENCED_PARAMETER(done);
}

}
#endif
