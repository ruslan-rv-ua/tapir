/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Auto_AdvanceInputs */

const uk_settings_auto_advance = /** @type {(inputs: Settings_Auto_AdvanceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Автоматично відтворювати наступний трек`)
};

const en_settings_auto_advance = /** @type {(inputs: Settings_Auto_AdvanceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Auto-play next track`)
};

/**
* | output |
* | --- |
* | "Auto-play next track" |
*
* @param {Settings_Auto_AdvanceInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_auto_advance = /** @type {((inputs?: Settings_Auto_AdvanceInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Auto_AdvanceInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_auto_advance(inputs)
	return en_settings_auto_advance(inputs)
});