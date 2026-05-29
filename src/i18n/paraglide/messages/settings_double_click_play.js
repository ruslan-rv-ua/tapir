/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Double_Click_PlayInputs */

const uk_settings_double_click_play = /** @type {(inputs: Settings_Double_Click_PlayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворення`)
};

const en_settings_double_click_play = /** @type {(inputs: Settings_Double_Click_PlayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Play`)
};

/**
* | output |
* | --- |
* | "Play" |
*
* @param {Settings_Double_Click_PlayInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_double_click_play = /** @type {((inputs?: Settings_Double_Click_PlayInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Double_Click_PlayInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_double_click_play(inputs)
	return en_settings_double_click_play(inputs)
});