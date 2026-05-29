/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_Empty_DescriptionInputs */

const uk_streams_empty_description = /** @type {(inputs: Streams_Empty_DescriptionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список потоків порожній. Натисніть Enter, щоб додати перший потік.`)
};

const en_streams_empty_description = /** @type {(inputs: Streams_Empty_DescriptionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No streams yet. Press Enter to add the first stream.`)
};

/**
* | output |
* | --- |
* | "No streams yet. Press Enter to add the first stream." |
*
* @param {Streams_Empty_DescriptionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_empty_description = /** @type {((inputs?: Streams_Empty_DescriptionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Empty_DescriptionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_empty_description(inputs)
	return en_streams_empty_description(inputs)
});