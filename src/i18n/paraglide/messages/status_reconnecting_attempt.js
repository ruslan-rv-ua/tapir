/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ attempt: NonNullable<unknown>, max: NonNullable<unknown> }} Status_Reconnecting_AttemptInputs */

const uk_status_reconnecting_attempt = /** @type {(inputs: Status_Reconnecting_AttemptInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Спроба ${i?.attempt} з ${i?.max}`)
};

const en_status_reconnecting_attempt = /** @type {(inputs: Status_Reconnecting_AttemptInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Attempt ${i?.attempt} of ${i?.max}`)
};

/**
* | output |
* | --- |
* | "Attempt {attempt} of {max}" |
*
* @param {Status_Reconnecting_AttemptInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_reconnecting_attempt = /** @type {((inputs: Status_Reconnecting_AttemptInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_Reconnecting_AttemptInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_reconnecting_attempt(inputs)
	return en_status_reconnecting_attempt(inputs)
});