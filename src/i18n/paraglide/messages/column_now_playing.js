/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_Now_PlayingInputs */

const uk_column_now_playing = /** @type {(inputs: Column_Now_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зараз грає`)
};

const en_column_now_playing = /** @type {(inputs: Column_Now_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Now playing`)
};

/**
* | output |
* | --- |
* | "Now playing" |
*
* @param {Column_Now_PlayingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_now_playing = /** @type {((inputs?: Column_Now_PlayingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_Now_PlayingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_now_playing(inputs)
	return en_column_now_playing(inputs)
});