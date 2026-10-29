package dev.pumpwatch.pipeline.extractor;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SimHashTest {
    @Test
    void sameWordsDifferentCaseAndPunctuationAreNear() {
        assertThat(SimHash.near(SimHash.of("Buy $GME now, to the moon"), SimHash.of("buy $gme NOW to the moon!!!"))).isTrue();
    }

    @Test
    void oneWordChangedInALongPostIsNear() {
        String a = "huge squeeze incoming load up on shares before the market opens tomorrow because this stock will explode higher once the shorts are forced to cover their positions and everybody who held will be very rich soon";
        assertThat(SimHash.near(SimHash.of(a), SimHash.of(a.replace("soon", "fast")))).isTrue();
    }

    @Test
    void unrelatedTextIsNotNear() {
        assertThat(SimHash.near(SimHash.of("huge squeeze incoming load up on shares tomorrow"),
                SimHash.of("quarterly results were fine and the guidance is unchanged"))).isFalse();
    }
}
