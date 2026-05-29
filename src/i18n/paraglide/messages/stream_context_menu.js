/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Stream_Context_MenuInputs */

const uk_stream_context_menu = /** @type {(inputs: Stream_Context_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Контекстне меню потоку`)
};

const en_stream_context_menu = /** @type {(inputs: Stream_Context_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stream context menu`)
};

/**
* | output |
* | --- |
* | "Stream context menu" |
*
* @param {Stream_Context_MenuInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_context_menu = /** @type {((inputs?: Stream_Context_MenuInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_Context_MenuInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_context_menu(inputs)
	return en_stream_context_menu(inputs)
});