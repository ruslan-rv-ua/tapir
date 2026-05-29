/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} PlayInputs */

const uk_play = /** @type {(inputs: PlayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворити`)
};

const en_play = /** @type {(inputs: PlayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Play`)
};

/**
* | output |
* | --- |
* | "Play" |
*
* @param {PlayInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const play = /** @type {((inputs?: PlayInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<PlayInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_play(inputs)
	return en_play(inputs)
});