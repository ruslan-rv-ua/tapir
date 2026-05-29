/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_SectionInputs */

const uk_streams_section = /** @type {(inputs: Streams_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Потоки`)
};

const en_streams_section = /** @type {(inputs: Streams_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Streams`)
};

/**
* | output |
* | --- |
* | "Streams" |
*
* @param {Streams_SectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_section = /** @type {((inputs?: Streams_SectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_SectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_section(inputs)
	return en_streams_section(inputs)
});