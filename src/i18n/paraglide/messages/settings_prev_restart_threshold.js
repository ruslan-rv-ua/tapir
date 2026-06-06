/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Prev_Restart_ThresholdInputs */

const uk_settings_prev_restart_threshold = /** @type {(inputs: Settings_Prev_Restart_ThresholdInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`«Попередній» рестартує трек, якщо грав довше ніж (секунд, 0 = вимк)`)
};

const en_settings_prev_restart_threshold = /** @type {(inputs: Settings_Prev_Restart_ThresholdInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`“Previous” restarts the track if played longer than (seconds, 0 = off)`)
};

/**
* | output |
* | --- |
* | "“Previous” restarts the track if played longer than (seconds, 0 = off)" |
*
* @param {Settings_Prev_Restart_ThresholdInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_prev_restart_threshold = /** @type {((inputs?: Settings_Prev_Restart_ThresholdInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Prev_Restart_ThresholdInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_prev_restart_threshold(inputs)
	return en_settings_prev_restart_threshold(inputs)
});