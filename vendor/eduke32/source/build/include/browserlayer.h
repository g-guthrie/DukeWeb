#pragma once

#ifndef build_browserlayer_h_
#define build_browserlayer_h_

#include "compat.h"

#ifdef __cplusplus
extern "C" {
#endif

int32_t browserGetInjectedButtonsLow(void);
int32_t browserConsumeInjectedMouseX(void);
int32_t browserConsumeInjectedMouseY(void);

void browserPublishTileLoad(int32_t tileNum, int32_t size, int32_t phase);
void browserPublishCacheProgress(int32_t tile, int32_t loaded, int32_t queued, int32_t done);

#ifdef __cplusplus
}
#endif

#endif
