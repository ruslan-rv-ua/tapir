/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Min_Track_DurationInputs */

const uk_settings_min_track_duration = /** @type {(inputs: Settings_Min_Track_DurationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Мінімальна тривалість треку (сек)`)
};

const en_settings_min_track_duration = /** @type {(inputs: Settings_Min_Track_DurationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Minimum track duration (sec)`)
};

/**
* | output |
* | --- |
* | "Minimum track duration (sec)" |
*
* @param {Settings_Min_Track_DurationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_min_track_duration = /** @type {((inputs?: Settings_Min_Track_DurationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Min_Track_DurationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_min_track_duration(inputs)
	return en_settings_min_track_duration(inputs)
});