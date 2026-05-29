/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Connection_ErrorInputs */

const uk_connection_error = /** @type {(inputs: Connection_ErrorInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Помилка з'єднання: ${i?.name}`)
};

const en_connection_error = /** @type {(inputs: Connection_ErrorInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Connection error: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Connection error: {name}" |
*
* @param {Connection_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const connection_error = /** @type {((inputs: Connection_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Connection_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_connection_error(inputs)
	return en_connection_error(inputs)
});