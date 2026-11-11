package dev.pumpwatch.common;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** Next-hour price range forecast. median and upperBand are percent of price (size of move, never direction). */
public record Swing(double median, double upperBand, Regime regime) {
    /** Relative to the ticker's own trailing hourly ranges. */
    public enum Regime {
        CALM, ELEVATED, EXTREME;

        @JsonValue
        public String json() {
            return name().toLowerCase(Locale.ROOT);
        }
    }
}
