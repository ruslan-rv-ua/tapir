/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_LoadingInputs */

const uk_songs_loading = /** @type {(inputs: Songs_LoadingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Завантаження записів…`)
};

const en_songs_loading = /** @type {(inputs: Songs_LoadingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Loading recordings…`)
};

/**
* | output |
* | --- |
* | "Loading recordings…" |
*
* @param {Songs_LoadingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_loading = /** @type {((inputs?: Songs_LoadingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_LoadingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_loading(inputs)
	return en_songs_loading(inputs)
});